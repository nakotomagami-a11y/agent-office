// The real LoopRunner: spawns through the same summon path as every other run.

import * as db from "../db/index";
import { log } from "../infra/log";
import { startSummonRun } from "./summon-run";
import { ruleExists } from "./loop-rules";
import type { LoopRunner } from "./loop-runner";

export const productionLoopRunner: LoopRunner = {
  async startRun(input) {
    const result = await startSummonRun({
      agentId: input.agentId,
      prompt: input.prompt,
      instanceId: input.instanceId ?? undefined,
      projectId: input.projectId ?? undefined,
      cwd: input.cwd ?? undefined,
    });
    // Throwing is correct here: `advanceLoop` catches it and terminates the
    // loop with `dispatch_failed`, which is visible. Returning a fake id would
    // strand it instead.
    if ("error" in result) {
      throw Object.assign(new Error(result.error.message), { code: result.error.code });
    }
    return result.runId;
  },

  costOf(runId) {
    const run = db.getRun(runId);
    if (!run) {
      // Unknown cost is not zero. Reporting 0 silently under-counts the budget
      // ceiling every round, which is how a ceiling stops being one.
      log.warn("loop.cost_unavailable", { runId });
      return 0;
    }
    return run.cost;
  },

  ruleExists,
};
