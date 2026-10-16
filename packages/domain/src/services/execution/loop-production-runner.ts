// The real LoopRunner: spawns through the same summon path as every other run.

import * as db from "../db/index";
import { log } from "../infra/log";
import { startSummonRun } from "./summon-run";
import { ruleExists, knownRuleIds } from "./loop-rules";
import { findingsForRun } from "./loop-findings";
import * as conversation from "./conversation";
import { productionConversationRunner } from "./conversation-runner";
import type { LoopRunner } from "./loop-runner";

const fail = (code: string, message: string) => Object.assign(new Error(message), { code });

/** Only into an IDLE chat with an empty queue: queued behind the user's
 *  messages, the round would have no run id for the loop to wait on. */
async function startInConversation(conversationId: string, prompt: string, maxBudgetUsd?: number): Promise<string> {
  const conv = db.getConversation(conversationId);
  if (!conv) throw fail("conversation_not_found", `conversation ${conversationId} is gone`);
  // Retryable: `rekickConversationLoops` tries again when the chat's turn ends.
  if (conv.status !== "idle" || db.listQueue(conversationId).length > 0) {
    throw fail("already_running", "the chat is busy");
  }
  const view = await conversation.sendMessageToConversation(
    conversationId, prompt, productionConversationRunner, undefined, "system", maxBudgetUsd,
  );
  if (!view.activeRunId) throw fail("start_failed", "the chat could not start the round");
  return view.activeRunId;
}

export const productionLoopRunner: LoopRunner = {
  async startRun(input) {
    if (input.conversationId) return startInConversation(input.conversationId, input.prompt, input.maxBudgetUsd);
    const result = await startSummonRun({
      agentId: input.agentId,
      prompt: input.prompt,
      instanceId: input.instanceId ?? undefined,
      projectId: input.projectId ?? undefined,
      cwd: input.cwd ?? undefined,
      maxBudgetUsd: input.maxBudgetUsd,
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
  ruleIds: (cwd) => [...knownRuleIds(cwd)],
  findingsFor: findingsForRun,
};
