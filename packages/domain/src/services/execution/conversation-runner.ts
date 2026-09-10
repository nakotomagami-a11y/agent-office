/**
 * Production {@link ConversationRunner} — the bridge from the pure
 * conversation service to the real run engine. Split into a pure mapping
 * function (`buildSummonRequest`, unit-tested) and a thin `startRun` that
 * calls `summon-run.startSummonRun` for real, so the risk surface (translating
 * a conversation's start-run effect into a `SummonRequest`) is testable
 * without spawning `claude`.
 */
import type { SummonRequest } from "../../types/index";
import { startSummonRun } from "./summon-run";
import type { ConversationRunner, StartRunInput } from "./conversation";

export function buildSummonRequest(input: StartRunInput): SummonRequest {
  return {
    agentId: input.agentId,
    prompt: input.prompt,
    // "default" is the DB's null-instance sentinel (see transcriptKey /
    // db/transcripts.ts) — the rest of the summon path expects it omitted,
    // not the literal string, for the default slot.
    instanceId: input.instanceId === "default" ? undefined : input.instanceId,
    projectId: input.projectId ?? undefined,
    resumeSessionId: input.resumeSessionId ?? undefined,
    conversationId: input.conversationId,
    contextProfile: input.contextProfile,
  };
}

export const productionConversationRunner: ConversationRunner = {
  async startRun(input) {
    const req = buildSummonRequest(input);
    const result = await startSummonRun(req);
    if ("error" in result) {
      throw new Error(result.error.message);
    }
    return result.runId;
  },
};
