/**
 * Side-effect module: connects the run engine to the Loop dispatcher. Importing
 * it registers the listener — the ONLY place that happens. Same shape and same
 * cycle constraints as `conversation-wiring.ts`; see that file's header.
 */
import { registerRunFinishedListener } from "./runs";
import { onLoopRunFinished } from "./loop-runner";
import { productionLoopRunner } from "./loop-production-runner";
import { emitAppEvent } from "../infra/events";
import { log } from "../infra/log";

declare global {
  // HMR-safety: without this, editing this file in dev registers a second
  // closure into a listener Set that survives HMR, double-advancing every
  // loop. Identical rationale to `__agentOfficeConversationWiringInstalled`.
  // eslint-disable-next-line no-var
  var __agentOfficeLoopWiringInstalled: boolean | undefined;
}

if (!globalThis.__agentOfficeLoopWiringInstalled) {
  registerRunFinishedListener((runId, ok) => {
    void onLoopRunFinished(runId, ok, productionLoopRunner, Date.now())
      .then(() => emitAppEvent("loops:changed"))
      .catch((err) => {
        log.error("loop.on_run_finished_failed", { runId, err: String(err) });
      });
  });
  globalThis.__agentOfficeLoopWiringInstalled = true;
}
