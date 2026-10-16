/**
 * Side-effect module: connects the run engine to the Loop dispatcher. Importing
 * it registers the listener — the ONLY place that happens. Same shape and same
 * cycle constraints as `conversation-wiring.ts`; see that file's header.
 */
import { registerRunFinishedListener } from "./runs";
import { onLoopRunFinished, rekickConversationLoops } from "./loop-runner";
import { productionLoopRunner } from "./loop-production-runner";
import { maybeStartQaLoop } from "./qa-loop";
import { log } from "../infra/log";

declare global {
  // HMR-safety: without this, editing this file in dev registers a second
  // closure into a listener Set that survives HMR, double-advancing every
  // loop. Identical rationale to `__agentOfficeConversationWiringInstalled`.
  var __agentOfficeLoopWiringInstalled: boolean | undefined;
}

if (!globalThis.__agentOfficeLoopWiringInstalled) {
  registerRunFinishedListener((runId, ok) => {
    // The event is emitted by the service on each real state change, not here:
    // this fires for EVERY run, so emitting from the wiring would invalidate
    // every open tab on every chat turn.
    void onLoopRunFinished(runId, ok, productionLoopRunner, Date.now())
      .catch((err) => {
        log.error("loop.on_run_finished_failed", { runId, err: String(err) });
      });
    void rekickConversationLoops(runId, productionLoopRunner, Date.now())
      .catch((err) => {
        log.error("loop.rekick_failed", { runId, err: String(err) });
      });
    void maybeStartQaLoop(runId, ok, productionLoopRunner, Date.now())
      .catch((err) => {
        log.error("qa_loop.start_failed", { runId, err: String(err) });
      });
  });
  globalThis.__agentOfficeLoopWiringInstalled = true;
}
