// When a conversation may be handed over to a fresh session, and the DB side of doing it.
// The orchestration (which turn starts) stays in conversation.ts. See config/handoff.ts.

import * as db from "../db";
import { log } from "../infra/log";
import { emitAppEvent } from "../infra/events";
import { HANDOFF_PROMPT_HEAD, MAX_AUTO_HANDOFFS, buildHandoffPrompt, endsWithHandoff } from "../../config/handoff";
import { RESUME_PROMPT } from "./conversation-machine";
import { QA_GOAL_FILES_HEADING } from "../../config/loop";

export type HandoffBlocker = "turn_running" | "nothing_to_hand_off" | "not_current" | "loop_running";

/** Blocks both the automatic and the manual path. A replaced conversation is one the UI no
 *  longer shows; a loop drives its fix rounds by conversation id, so a new one would strand it. */
function seatBlocker(conv: db.ConversationRow): HandoffBlocker | null {
  if (db.getActiveConversation(conv.agentId, conv.instanceId)?.id !== conv.id) return "not_current";
  if (db.listLoopsForConversation(conv.id).some((l) => !l.state.binding)) return "loop_running";
  return null;
}

export function manualHandoffBlocker(conv: db.ConversationRow): HandoffBlocker | null {
  if (conv.status === "running") return "turn_running";
  if (!db.latestConversationTurn(conv.id)) return "nothing_to_hand_off";
  return seatBlocker(conv);
}

/** Called before the finish is applied, while `conv` still shows `run` as its active turn. */
export function wantsAutoHandoff(conv: db.ConversationRow, run: { id: string; output: string }): boolean {
  if (!endsWithHandoff(run.output) || conv.activeRunId !== run.id) return false;
  const depth = db.autoHandoffChainLength(conv.agentId, conv.instanceId, MAX_AUTO_HANDOFFS);
  // After one takeover a queued user message runs next: it may be "stop", and it resets the chain.
  const userWaiting = depth > 0 && db.listQueue(conv.id).some((m) => m.origin === "user");
  const refused = seatBlocker(conv) ?? (depth >= MAX_AUTO_HANDOFFS ? "limit" : userWaiting ? "user_message_queued" : null);
  if (refused) log.warn("conversation.handoff_refused", { convId: conv.id, reason: refused, depth });
  return refused === null;
}

/** One transaction, so a crash cannot lose the queue between the two conversations. The event
 *  goes out before the takeover spawns, so clients drop the old id as early as possible. */
export function moveToFreshConversation(conv: db.ConversationRow, sessionId: string | null): db.ConversationRow {
  const fresh = db.getDb().transaction(() => {
    const queue = db.listQueue(conv.id);
    db.clearQueue(conv.id);
    db.updateConversation(conv.id, { status: "idle", activeRunId: null, ...(sessionId ? { sessionId } : {}) });
    const next = db.startNewConversation(conv.agentId, conv.instanceId, conv.projectId);
    db.replaceQueue(next.id, queue);
    return next;
  })();
  cancelPendingResumes(conv.id);
  log.info("conversation.handoff", { from: conv.id, to: fresh.id });
  emitAppEvent("conversations:changed");
  return fresh;
}

/** A scheduled resume of the spent session would run out of sight beside the fresh one. */
function cancelPendingResumes(convId: string): void {
  for (const job of db.listActiveScheduledJobs()) {
    if (job.status === "pending" && job.summonRequest.conversationId === convId) {
      db.updateScheduledJob(job.id, { status: "cancelled" }, "pending");
    }
  }
}

const CHAIN_LIMIT = 20;
const NOT_A_REQUEST = [HANDOFF_PROMPT_HEAD, RESUME_PROMPT];

function chainOf(agentId: string, instanceId: string, convId: string): string[] {
  const chain = db.handoffChain(agentId, instanceId, convId, CHAIN_LIMIT);
  const root = chain.at(-1);
  if (chain.length === CHAIN_LIMIT && root && isTakeoverPrompt(db.firstConversationTurn(root)?.prompt ?? "")) {
    log.warn("handoff.chain_truncated", { convId, limit: CHAIN_LIMIT });
  }
  return chain;
}

/** The user's message the chain works on, for a takeover prompt to quote. Turns that carry no
 *  request (takeovers, Resume) are skipped. A loop round works on its loop's goal; any other turn of
 *  Agent Office's own (a mission digest, a shell wake) means the user did not start this: no quote. */
export function chainRequest(agentId: string, instanceId: string, convId: string): string | null {
  for (const turn of db.chainTurns(chainOf(agentId, instanceId, convId), 50)) {
    if (NOT_A_REQUEST.some((p) => turn.prompt.startsWith(p))) continue;
    if (turn.origin === "user") return turn.prompt;
    const loop = db.listLoopsForConversation(turn.conversationId).find((l) => turn.prompt.includes(l.goal));
    return loop ? loop.goal.split(QA_GOAL_FILES_HEADING)[0]! : null;
  }
  return null;
}

export const isTakeoverPrompt = (prompt: string): boolean => prompt.startsWith(HANDOFF_PROMPT_HEAD);

export function takeoverPrompt(conv: db.ConversationRow): string {
  const lastReply = db.latestConversationTurn(conv.id)?.output ?? "";
  return buildHandoffPrompt(lastReply, chainRequest(conv.agentId, conv.instanceId, conv.id));
}
