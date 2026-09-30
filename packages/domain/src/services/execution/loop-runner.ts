/**
 * The Loop dispatcher: turns the pure machine's effects into real runs, and
 * real run completions back into actions.
 *
 * The machine owns the ceilings; this owns nothing but translation. Anything
 * resembling a policy decision here is a bug — it belongs in `loop-machine.ts`
 * where it is deterministic and testable.
 */
import { randomUUID } from "node:crypto";
import * as db from "../db/index";
import { log } from "../infra/log";
import {
  reduceLoop, initialLoopState, describeTermination,
  type Finding, type LoopAction, type LoopConfig, type LoopEffect, type LoopState,
} from "./loop-machine";

/** Abstracts "spawn a run and give me its id", mirroring ConversationRunner.
 *  Injected so the dispatcher is testable without spawning a CLI. */
export interface LoopRunner {
  startRun(input: {
    agentId: string;
    instanceId: string | null;
    projectId: string | null;
    cwd: string | null;
    prompt: string;
  }): Promise<string>;
  /** Cost of a finished run, for the budget ceiling. */
  costOf(runId: string): number;
  /** Does this rule id resolve? A finding citing a rule that does not exist is
   *  a miswired reviewer, and the machine treats the batch as invalid. */
  ruleExists(id: string): boolean;
}

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

function reviewPrompt(goal: string, round: number): string {
  return [
    `Review the work just done against this goal:`,
    goal,
    ``,
    `Round ${round}. Report findings with ReportFindings. Every finding MUST cite a`,
    `ruleId that resolves in docs/conventions.md — a finding with no rule is an`,
    `opinion and the whole batch will be rejected.`,
  ].join("\n");
}

function fixPrompt(goal: string, round: number, open: Finding[]): string {
  const list = open
    .map((f) => `- [${f.severity}] ${f.ruleId}${f.file ? ` (${f.file}${f.line ? `:${f.line}` : ""})` : ""}: ${f.why}`)
    .join("\n");
  return [
    `Round ${round}. Fix EXACTLY these findings against the goal:`,
    goal,
    ``,
    list,
    ``,
    `Do not take on unrelated work — an unbounded fix round is how a loop stops converging.`,
  ].join("\n");
}

/** Start a loop and dispatch its first authoring run. */
export async function startLoop(input: StartLoopInput, runner: LoopRunner, now: number): Promise<string> {
  const id = randomUUID();
  const state = initialLoopState(now);
  const runId = await runner.startRun({
    agentId: input.agentId,
    instanceId: input.instanceId ?? null,
    projectId: input.projectId ?? null,
    cwd: input.cwd ?? null,
    prompt: input.goal,
  });
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
      config: input.config,
      activeRunId: runId,
    },
    now,
  );
  log.info("loop.started", { loopId: id, runId, maxRounds: input.config.maxRounds });
  return id;
}

/** Which action a finished run represents depends on the phase that dispatched
 *  it — the machine rejects anything out of phase, so this must not guess. */
function actionFor(state: LoopState, ok: boolean, costUsd: number, findings: Finding[]): LoopAction | null {
  switch (state.phase) {
    case "authoring": return { type: "authorFinished", ok, costUsd };
    case "reviewing": return { type: "reviewFinished", ok, costUsd, findings };
    case "fixing": return { type: "fixFinished", ok, costUsd };
    default: return null;
  }
}

async function dispatch(loop: db.LoopRow, effects: LoopEffect[], runner: LoopRunner): Promise<string | null> {
  for (const e of effects) {
    if (e.type === "finish") return null;
    const prompt = e.type === "startReview"
      ? reviewPrompt(loop.goal, e.round)
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
  return null;
}

/**
 * Advance a loop. `findings` come from the reviewer's ReportFindings output;
 * an empty array from a review that produced none is a genuine pass, which is
 * why it is not conflated with `ok: false`.
 */
export async function advanceLoop(
  loopId: string,
  action: LoopAction,
  runner: LoopRunner,
  now: number,
): Promise<void> {
  const loop = db.getLoop(loopId);
  if (!loop) return;

  const { state, effects } = reduceLoop(loop.state, action, loop.config, now, runner.ruleExists);
  // Nothing moved: the machine rejected the action (wrong phase, or terminal).
  // Persisting anyway would let a duplicate finish clear `active_run_id` and
  // strand the loop.
  if (state === loop.state && effects.length === 0) {
    log.warn("loop.action_ignored", { loopId, action: action.type, phase: loop.state.phase });
    return;
  }

  const nextRunId = await dispatch(loop, effects, runner);
  db.updateLoopState(loopId, state, nextRunId, now);

  if (state.binding) {
    log.info("loop.finished", { loopId, binding: state.binding, summary: describeTermination(state, loop.config) });
  }
}

/** Entry point from the run engine. Ignores runs that are not a loop's. */
export async function onLoopRunFinished(
  runId: string,
  ok: boolean,
  runner: LoopRunner,
  now: number,
  findings: Finding[] = [],
): Promise<void> {
  const loop = db.getLoopByActiveRun(runId);
  if (!loop) return;
  const action = actionFor(loop.state, ok, runner.costOf(runId), findings);
  if (!action) return;
  await advanceLoop(loop.id, action, runner, now);
}
