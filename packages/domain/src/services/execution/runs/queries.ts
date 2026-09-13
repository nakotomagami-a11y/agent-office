// Read-only views over the live-run registry (+ persisted DB rows). No
// mutation, no spawning — just projections used by the API routes and the
// spawn guard. Split out of runs.ts so reads don't have to live inside the
// stateful spawn machine.

import type { PersistedRun, WorkflowNode } from "../../../types/index";
import * as db from "../../db";
import { getLiveRun, liveRuns } from "./registry";

export function getLiveRunAsPersistedRun(runId: string): PersistedRun | undefined {
  const r = liveRuns.get(runId);
  if (!r) return undefined;
  return {
    id: r.id,
    agentId: r.agentId,
    agentName: r.agentName,
    ts: r.startTs,
    prompt: r.prompt,
    status: r.status,
    exitCode: r.exitCode,
    output: r.output,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    cost: r.cost,
    durMs: Date.now() - r.startTs,
    model: r.model,
    effort: r.effort,
    cwd: r.cwd,
    projectId: r.projectId,
    instanceId: r.instanceId,
    instanceLabel: r.instanceLabel,
    sessionId: r.sessionId,
    parentRunId: r.parentRunId,
    conversationId: r.conversationId,
    currentTool: r.currentTool,
  };
}

/**
 * Build the spawn tree rooted at `rootId` by walking `parentRunId` links in the
 * DB and overlaying in-flight `liveRuns` state (fresher tokens/cost/status for
 * runs still streaming). Depth-capped and cycle-guarded. Returns null when the
 * root run is unknown.
 */
export function buildRunTree(rootId: string, maxDepth = 6): WorkflowNode | null {
  const visited = new Set<string>();

  const toNode = (run: PersistedRun, depth: number): WorkflowNode => {
    visited.add(run.id);
    const live = getLiveRun(run.id);
    const status = live?.status ?? run.status;
    const durMs = live
      ? (live.status === "running" ? Date.now() - live.startTs : (live.finishedAt ?? Date.now()) - live.startTs)
      : run.durMs;

    const children: WorkflowNode[] =
      depth >= maxDepth
        ? []
        : db
            .getChildRuns(run.id)
            .filter((c) => !visited.has(c.id))
            .map((c) => toNode(c, depth + 1));

    return {
      runId: run.id,
      agentId: run.agentId,
      agentName: run.agentName,
      status,
      prompt: run.prompt,
      startTs: run.ts,
      durMs,
      tokensIn: live?.tokensIn ?? run.tokensIn,
      tokensOut: live?.tokensOut ?? run.tokensOut,
      cost: live?.cost ?? run.cost,
      children,
    };
  };

  const root = getLiveRunAsPersistedRun(rootId) ?? db.getRun(rootId);
  if (!root) return null;
  return toNode(root, 0);
}

export function getRunningRuns(): PersistedRun[] {
  return Array.from(liveRuns.values())
    .filter((r) => r.status === "running")
    .map((r): PersistedRun => ({
      id: r.id,
      agentId: r.agentId,
      agentName: r.agentName,
      ts: r.startTs,
      prompt: r.prompt,
      status: "running",
      output: r.output,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      cost: r.cost,
      durMs: Date.now() - r.startTs,
      model: r.model,
      effort: r.effort,
      cwd: r.cwd,
      projectId: r.projectId,
      instanceId: r.instanceId,
      instanceLabel: r.instanceLabel,
      currentTool: r.currentTool,
    }));
}

/**
 * Is there already a live, running `claude` process for this exact target
 * (same agentId + instanceId — the same slot `transcriptKey()` on the client
 * uses to key a conversation)? Used by `startSummonRun` as a spawn guard.
 *
 * Why this exists: the client is supposed to serialize sends per target (see
 * `useQueueDrain` in `use-chat-actions.ts`) and never issue a second
 * `/api/summon` for a target that already has an active run. But a project-tab
 * switch can unmount the `ChatPanel` mid-request, and TanStack Query's
 * `MutationObserver` drops the *per-call* `.mutate(vars, { onSuccess })`
 * callback once its last subscriber (the unmounted component) is gone — the
 * POST still completes and this module still spawns the process, but the
 * client never learns the new `runId` and is left with `activeRunId: null`.
 * If the user then retries (e.g. "New Thread" + resend), nothing on the
 * client stops a second `/api/summon` for the same target — the first
 * process is still running, orphaned but alive. This function is the
 * backend-side backstop: it makes "one live run per target" true regardless
 * of what the client does or fails to track.
 */
export function findActiveRunForTarget(
  agentId: string,
  instanceId: string | undefined,
): { runId: string; prompt: string } | undefined {
  for (const run of liveRuns.values()) {
    if (run.status !== "running") continue;
    if (run.agentId !== agentId) continue;
    if (run.instanceId !== instanceId) continue;
    return { runId: run.id, prompt: run.prompt };
  }
  return undefined;
}
