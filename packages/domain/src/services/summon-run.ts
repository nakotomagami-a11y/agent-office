import { existsSync, statSync } from "node:fs";
import type { ContextProfile, SummonRequest } from "../types/index";
import * as agents from "./agents";
import * as health from "./health";
import * as history from "./history";
import * as paths from "./paths";
import * as projects from "./projects";
import * as runs from "./runs";
import * as secrets from "./secrets";
import * as store from "./store";
import * as summon from "./summon";

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

/**
 * Compose and start a run from a validated SummonRequest. Shared by the
 * /api/summon route and the scheduler so both drive runs identically
 * (health check, cwd resolution, prior-context injection, session resume).
 */
export async function startSummonRun(req: SummonRequest): Promise<SummonResult> {
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

  const built = summon.buildClaudeArgs({
    request: req,
    agent: agent.info,
    instance,
    appendedSystemPrompt,
    priorContext,
  });

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

  store.pushRecentPrompt(req.agentId, req.prompt);

  const instanceLabel = instance?.label ?? (instance ? agent.info.name : undefined);
  const { runId } = runs.startRun({
    agentId: req.agentId,
    agentName: instanceLabel ?? agent.info.name,
    prompt: req.prompt,
    model: built.model,
    effort: built.effort,
    cwd: cwdResolution.cwd,
    projectId: req.projectId,
    instanceId: req.instanceId ?? instance?.instanceId,
    instanceLabel,
    args: built.args,
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
