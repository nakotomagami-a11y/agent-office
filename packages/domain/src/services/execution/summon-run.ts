import { existsSync, statSync } from "node:fs";
import type { ContextProfile, SummonRequest } from "../../types/index";
import { MIN_SEAT_TURN_USD } from "../../config/missions";
import * as agents from "../agents/agents";
import * as db from "../db";
import * as health from "../infra/health";
import * as history from "../projects/history";
import { log } from "../infra/log";
import * as paths from "../infra/paths";
import * as projects from "../projects/projects";
import * as runs from "./runs";
import * as secrets from "../accounts/secrets";
import * as store from "../infra/store";
import * as summon from "./summon";
import { chatSessions } from "./chat-session-registry";

export interface SummonError { status: number; message: string; code?: string }
export type SummonResult = { runId: string } | { error: SummonError };

function resolveCwd(
  project: ReturnType<typeof projects.readProject> | null,
  instance: ReturnType<typeof projects.findInstance>,
  requestCwd: string | undefined,
): { cwd?: string } | { error: SummonError } {
  const instanceCwd = projects.resolveInstanceCwd(project, instance);
  const requestedCwd = instanceCwd ?? projects.resolveSummonCwd(requestCwd, project);
  if (!requestedCwd) return { cwd: undefined };
  const expanded = paths.expandTilde(requestedCwd);
  if (!existsSync(expanded) || !statSync(expanded).isDirectory()) {
    const code = requestedCwd.includes(".worktrees") ? "worktree_missing" : "start_failed";
    return { error: { status: 400, code, message: `cwd not a directory: ${requestedCwd}` } };
  }
  return { cwd: expanded };
}

function buildPriorContext(req: SummonRequest): { priorContext?: string; hasMessages: boolean } {
  if (req.resumeSessionId) return { hasMessages: false };
  const profile: ContextProfile = req.contextProfile ?? "balanced";
  const msgs = history.getContextMessages({
    agentId: req.agentId,
    instanceId: req.instanceId ?? "default",
    projectId: req.projectId,
    profile,
    currentPrompt: req.prompt,
  });
  if (msgs.length === 0) return { hasMessages: false };
  return { hasMessages: true, priorContext: history.formatPriorContext(msgs, profile) };
}

/** A mission seat's turn may spend at most what is left of its cap on this device: spend is only
 *  counted when a run ends, so without this one turn could run past the cap with no limit. */
export function withSeatBudget(req: SummonRequest, instanceId: string | undefined): SummonRequest | SummonError {
  const seat = instanceId ? db.missionSeatForInstance(instanceId) : null;
  if (!seat) return req;
  const left = seat.capUsd - seat.spentUsd;
  if (left < MIN_SEAT_TURN_USD) {
    return { status: 409, code: "seat_cap_reached", message: `Mission seat ${seat.seat} has spent ${seat.spentUsd.toFixed(2)} of its ${seat.capUsd.toFixed(2)} cap on this device.` };
  }
  return { ...req, maxBudgetUsd: req.maxBudgetUsd && req.maxBudgetUsd > 0 ? Math.min(req.maxBudgetUsd, left) : left };
}

/** Everything a spawn for a request needs, checked: the argv, where it runs, and who it is. */
export interface PreparedSummon {
  built: summon.BuiltCommand;
  cwd?: string;
  /** The request's instance, or the project's seat for this agent. */
  instanceId?: string;
  instanceLabel?: string;
  agentName: string;
}

/**
 * Compose a spawn from a validated SummonRequest: health check, cwd resolution, prior-context
 * injection, session resume, budget, permission bridge and secret checks. Shared by one-shot runs
 * (`startSummonRun`) and a chat's long-lived process (execution/chat-session.ts).
 */
export async function prepareSummon(
  req: SummonRequest,
  opts: { streamInput?: boolean } = {},
): Promise<{ prepared: PreparedSummon } | { error: SummonError }> {
  const claudeStatus = await health.getHealth();
  if (!claudeStatus.available) {
    return { error: { status: 503, code: "claude_unavailable", message: claudeStatus.error ?? "claude unavailable" } };
  }

  const agent = agents.readAgent(req.agentId);
  if (!agent) return { error: { status: 400, code: "unknown_agent", message: `unknown agent: ${req.agentId}` } };

  const project = req.projectId ? projects.readProject(req.projectId) : null;
  const instance = projects.findInstance(project, req.instanceId);

  const cwdResolution = resolveCwd(project, instance, req.cwd);
  if ("error" in cwdResolution) return { error: cwdResolution.error };

  const { priorContext, hasMessages } = buildPriorContext(req);
  const appendedSystemPrompt = agents.buildAppendedPrompt(req.agentId, project, req.instanceId, hasMessages);

  const budgeted = withSeatBudget(req, instance?.instanceId);
  if ("status" in budgeted) return { error: budgeted };
  const ownInstance = instance?.agentId === req.agentId ? instance : null; // a loop reviewer borrows only the seat's cwd
  const built = summon.buildClaudeArgs({
    request: budgeted,
    agent: agent.info,
    instance: ownInstance,
    // A borrowed hub-branch worktree is still one: isolate by where it runs, not whose chat it is.
    isolate: summon.isMissionWorktree(instance),
    appendedSystemPrompt,
    priorContext,
    streamInput: opts.streamInput,
  });

  // Refuse rather than run: a prompting mode with no bridge denies every tool
  // call with no visible cause, which is indistinguishable from the agent
  // deciding not to act.
  if (built.permissionBridgeMissing) {
    return { error: {
      status: 500,
      code: "permission_bridge_missing",
      message: `Permission bridge not found at ${built.permissionBridgeMissing}. Runs that need approval cannot start.`,
    } };
  }

  // Verify-before-run: block the spawn if any opted-in secret fails a live test
  // (a fresh 401 is proof; an expiry date is not). Untested/unknown secrets
  // never reach here. Scoped to the interactive summon path.
  if (req.projectId) {
    const failed = secrets.verifyForProject(req.projectId);
    if (failed) {
      return {
        error: {
          status: 422,
          code: "secret_invalid",
          message: `Secret "${failed.name}" failed its validity check — the run was blocked. ${failed.output.trim().slice(0, 300)}`,
        },
      };
    }
  }

  const instanceLabel = ownInstance?.label ?? (instance ? agent.info.name : undefined);
  return {
    prepared: {
      built,
      cwd: cwdResolution.cwd,
      instanceId: req.instanceId ?? instance?.instanceId,
      instanceLabel,
      agentName: instanceLabel ?? agent.info.name,
    },
  };
}

/**
 * Compose and start a one-shot run from a validated SummonRequest. Shared by the
 * /api/summon route, the scheduler and the loop reviewer so they drive runs identically.
 */
export async function startSummonRun(req: SummonRequest): Promise<SummonResult> {
  const preparation = await prepareSummon(req);
  if ("error" in preparation) return preparation;
  const { built, cwd, instanceId: resolvedInstanceId, instanceLabel, agentName } = preparation.prepared;

  // A chat's process holds the seat's session between turns: an idle one makes way, a busy one is a running turn.
  if (!(await chatSessions.releaseIdleSeat(req.agentId, resolvedInstanceId))) {
    return { error: { status: 409, code: "already_running", message: "This agent is still working on a previous message." } };
  }

  // Spawn guard: never two `claude` processes for one (agentId, instanceId). The same prompt as the
  // live run is a caller retrying a start it lost track of: hand back that run. A different prompt is
  // refused with a retryable code, never dropped.
  const existing = runs.findActiveRunForTarget(req.agentId, resolvedInstanceId);
  if (existing) {
    if (existing.prompt.trim() === req.prompt.trim()) {
      log.warn("summon.duplicate_suppressed", {
        agentId: req.agentId,
        instanceId: resolvedInstanceId,
        existingRunId: existing.runId,
      });
      return { runId: existing.runId };
    }
    log.warn("summon.rejected_already_running", {
      agentId: req.agentId,
      instanceId: resolvedInstanceId,
      existingRunId: existing.runId,
    });
    return {
      error: {
        status: 409,
        code: "already_running",
        message: "This agent is still working on a previous message.",
      },
    };
  }

  store.pushRecentPrompt(req.agentId, req.prompt);

  const { runId } = runs.startRun({
    agentId: req.agentId,
    agentName,
    prompt: req.prompt,
    origin: req.origin,
    model: built.model,
    effort: built.effort,
    cwd,
    projectId: req.projectId,
    instanceId: resolvedInstanceId,
    instanceLabel,
    args: built.args,
    stdin: built.stdin,
    conversationId: req.conversationId,
  });

  return { runId };
}

/**
 * Does the target of a request still exist? A scheduled job must not fire if
 * the instance (or agent/project) it points at was deleted after scheduling.
 */
export function summonTargetExists(req: SummonRequest): boolean {
  if (!agents.readAgent(req.agentId)) return false;
  if (req.projectId) {
    const project = projects.readProject(req.projectId);
    if (!project) return false;
    if (req.instanceId) {
      const instance = projects.findInstance(project, req.instanceId);
      if (!instance) return false;
    }
  }
  return true;
}
