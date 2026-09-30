/**
 * The Loop dispatcher: effects -> real runs, run completions -> actions.
 * Translation only. Any policy decision here is a bug: it belongs in the pure
 * `loop-machine.ts`, where it is deterministic and testable.
 */
import { randomUUID } from "node:crypto";
import * as db from "../db/index";
import { log } from "../infra/log";
import { emitAppEvent } from "../infra/events";
import { authorPrompt, reviewPrompt, fixPrompt } from "./loop-prompts";
import {
  reduceLoop, initialLoopState, describeTermination, clampLoopConfig,
  type Finding, type LoopAction, type LoopConfig, type LoopEffect, type LoopState,
} from "./loop-machine";

export interface LoopRunner {
  startRun(input: {
    agentId: string;
    instanceId: string | null;
    projectId: string | null;
    cwd: string | null;
    prompt: string;
  }): Promise<string>;
  costOf(runId: string): number;
  /** A finding citing a rule that does not resolve is a miswired reviewer. */
  ruleExists(id: string): boolean;
  ruleIds(): readonly string[];
  /** A review's verdict; `null` means none was reported, which is NOT a pass. */
  findingsFor(runId: string): Finding[] | null;
}

/** Worth another attempt rather than ending a loop mid-flight. */
const RETRYABLE_DISPATCH = new Set(["claude_unavailable", "already_running", "secret_invalid"]);

export interface StartLoopInput {
  agentId: string;
  reviewerAgentId: string;
  instanceId?: string | null;
  projectId?: string | null;
  conversationId?: string | null;
  cwd?: string | null;
  goal: string;
  config: LoopConfig;
}

export async function startLoop(input: StartLoopInput, runner: LoopRunner, now: number): Promise<string> {
  const id = randomUUID();
  const state = initialLoopState(now);
  // Row first: a crash after spawning orphans the run.
  db.createLoop(
    {
      id,
      conversationId: input.conversationId ?? null,
      agentId: input.agentId,
      instanceId: input.instanceId ?? null,
      projectId: input.projectId ?? null,
      reviewerAgentId: input.reviewerAgentId,
      cwd: input.cwd ?? null,
      goal: input.goal,
      state,
      config: clampLoopConfig(input.config),
      activeRunId: null,
    },
    now,
  );

  let runId: string;
  try {
    runId = await runner.startRun({
      agentId: input.agentId,
      instanceId: input.instanceId ?? null,
      projectId: input.projectId ?? null,
      cwd: input.cwd ?? null,
      // Prefixed: startSummonRun returns an EXISTING run id on an identical
      // prompt, so a bare goal lets the loop adopt the user's own chat run.
      prompt: authorPrompt(input.goal),
    });
  } catch (e) {
    log.error("loop.dispatch_failed", { loopId: id, round: 1, message: String(e) });
    db.updateLoopState(id, { ...state, phase: "escalated", binding: "dispatch_failed" }, null, now);
    emitAppEvent("loops:changed");
    return id;
  }
  db.updateLoopState(id, state, runId, now);
  emitAppEvent("loops:changed");
  log.info("loop.started", { loopId: id, runId, maxRounds: input.config.maxRounds });
  return id;
}

/** The dispatching phase decides the action; never guess. */
function actionFor(state: LoopState, ok: boolean, costUsd: number, findings: Finding[]): LoopAction | null {
  switch (state.phase) {
    case "authoring": return { type: "authorFinished", ok, costUsd };
    case "reviewing": return { type: "reviewFinished", ok, costUsd, findings };
    case "fixing": return { type: "fixFinished", ok, costUsd };
    default: return null;
  }
}

async function dispatch(loop: db.LoopRow, e: LoopEffect | undefined, runner: LoopRunner): Promise<string | null> {
  if (!e || e.type === "finish") return null;
  {
    const prompt = e.type === "startReview"
      ? reviewPrompt(loop.goal, e.round, runner.ruleIds())
      : fixPrompt(loop.goal, e.round, e.findings);
    const agentId = e.type === "startReview" ? loop.reviewerAgentId : loop.agentId;
    return await runner.startRun({
      agentId,
      instanceId: loop.instanceId,
      projectId: loop.projectId,
      cwd: loop.cwd,
      prompt,
    });
  }
}

export async function advanceLoop(
  loopId: string,
  action: LoopAction,
  runner: LoopRunner,
  now: number,
  /** Set when the caller already CAS-claimed the active run, so an ignored
   *  action can put it back instead of leaving the loop stranded. */
  claimedRunId: string | null = null,
): Promise<void> {
  const loop = db.getLoop(loopId);
  if (!loop) return;

  const { state, effects } = reduceLoop(loop.state, action, loop.config, now, runner.ruleExists);
  if (effects.length > 1) {
    log.error("loop.multiple_effects", { loopId, count: effects.length });
  }
  // Persisting a rejected action clears `active_run_id` and strands the loop.
  if (state === loop.state && effects.length === 0) {
    log.warn("loop.action_ignored", { loopId, action: action.type, phase: loop.state.phase });
    if (claimedRunId) db.updateLoopState(loopId, loop.state, claimedRunId, now);
    return;
  }

  let nextRunId: string | null;
  try {
    nextRunId = await dispatch(loop, effects[0], runner);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code && RETRYABLE_DISPATCH.has(code)) {
      // Transient: return the claim so reconcile retries. A health blip is
      // not a ceiling decision.
      log.warn("loop.dispatch_retryable", { loopId, code, round: state.round });
      if (claimedRunId) db.updateLoopState(loopId, loop.state, claimedRunId, now);
      return;
    }
    // The claim is taken; returning here strands the loop with no verdict.
    log.error("loop.dispatch_failed", { loopId, code, round: state.round, message: String(e) });
    db.updateLoopState(loopId, { ...state, phase: "escalated", binding: "dispatch_failed" }, null, now);
    emitAppEvent("loops:changed");
    return;
  }

  // Guarded: a Stop decided while the spawn was in flight must not be lost.
  if (!db.updateLoopState(loopId, state, nextRunId, now, loop.updatedAt)) {
    log.warn("loop.write_conflict", { loopId, action: action.type, phase: state.phase });
    return;
  }
  emitAppEvent("loops:changed");

  if (state.binding) {
    log.info("loop.finished", { loopId, binding: state.binding, summary: describeTermination(state, loop.config) });
  }
}

/** Mirrors conversation.ts's reconcileIfStale; the orphan reaper is raw SQL. */
export async function reconcileLoopIfStale(loopId: string, runner: LoopRunner, now: number): Promise<void> {
  const loop = db.getLoop(loopId);
  if (!loop || loop.state.binding) return;

  if (!loop.activeRunId) {
    // Died between claim and write; the check below cannot see it.
    log.warn("loop.stranded_no_active_run", { loopId, phase: loop.state.phase });
    db.updateLoopState(loopId, { ...loop.state, phase: "escalated", binding: "dispatch_failed" }, null, now);
    return;
  }

  const run = db.getRun(loop.activeRunId);
  // Live, or not persisted yet — both mean wait.
  if (!run || run.status === "running") return;
  await onLoopRunFinished(loop.activeRunId, run.status === "done", runner, now);
}

export async function onLoopRunFinished(
  runId: string,
  ok: boolean,
  runner: LoopRunner,
  now: number,
): Promise<void> {
  const loop = db.getLoopByActiveRun(runId);
  if (!loop) return;
  // Claim BEFORE any await: two listeners for one run would both dispatch.
  if (!db.claimActiveRun(loop.id, runId)) return;
  let verdict: Finding[] = [];
  let reviewOk = ok;
  if (loop.state.phase === "reviewing") {
    const reported = runner.findingsFor(runId);
    if (reported === null) {
      // No verdict is not a pass: an unassessed diff read as a clean bill of
      // health in the first dogfood run.
      log.warn("loop.review_without_verdict", { loopId: loop.id, runId });
      reviewOk = false;
    } else {
      verdict = reported;
    }
  }
  const action = actionFor(loop.state, reviewOk, runner.costOf(runId), verdict);
  if (!action) {
    // Clear, not re-adopt: re-adopting re-arms this no-op every replay.
    log.warn("loop.finish_out_of_phase", { loopId: loop.id, runId, phase: loop.state.phase });
    db.updateLoopState(loop.id, loop.state, null, now);
    return;
  }
  await advanceLoop(loop.id, action, runner, now, runId);
}
