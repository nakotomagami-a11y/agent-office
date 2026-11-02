/**
 * Connects the run engine to the conversation service: `installConversationWiring`
 * registers the listener that drives the conversation queue's auto-advance —
 * this is the ONLY place that happens.
 *
 * Deliberately kept separate from `runs.ts` (which must not import this file,
 * or `conversation.ts`, or `summon-run.ts` — `summon-run.ts` already imports
 * `runs.ts`, so `runs.ts` importing anything that imports `summon-run.ts`
 * would be a cycle). `runs.ts` only exposes a plain callback registry
 * (`registerRunFinishedListener`); this module is what actually connects it.
 *
 * Installed by `installRunListeners` (run-listeners.ts), which every server's
 * `boot()` calls before it serves runs.
 */
import { registerRunFinishedListener } from "./runs";
import { onRunFinished } from "./conversation";
import { productionConversationRunner } from "./conversation-runner";
import { log } from "../infra/log";

declare global {
  // HMR-safety: without this guard, editing this file (or anything it
  // transitively imports) in dev would re-run the module top-level and
  // register a second, functionally-duplicate listener closure into the
  // listener Set (which itself already survives HMR via a `globalThis` slot
  // in runs.ts) — silently double-processing every run's finish from then on
  // (double-draining the queue). See the identical pattern + rationale on
  // `__agentOfficeRunsInstalled` in runs.ts.
  var __agentOfficeConversationWiringInstalled: boolean | undefined;
}

export function installConversationWiring(): void {
  if (globalThis.__agentOfficeConversationWiringInstalled) return;
  registerRunFinishedListener((runId, ok, sessionId) => {
    void onRunFinished(runId, ok, sessionId, productionConversationRunner).catch((err) => {
      log.error("conversation.on_run_finished_failed", { runId, err: String(err) });
    });
  });
  globalThis.__agentOfficeConversationWiringInstalled = true;
}
