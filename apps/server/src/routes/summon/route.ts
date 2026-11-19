// POST /api/summon — send a message to an agent seat's chat and answer with the run that reads it
// (follow it at /api/runs/:id/stream). The seat's live process takes it at once, even mid-turn.
import { conversation, conversationRunner, db } from "@agent-office/domain/services";
import { validateBody } from "../../lib/validation";
import { summonRequestSchema } from "@agent-office/api-contract";
import { badRequest, serverError } from "../../lib/api-helpers";
import { log } from "@agent-office/domain/services/infra/log";

export async function POST(request: Request) {
  try {
    const raw: unknown = await request.json();
    const { data: req, error } = validateBody(summonRequestSchema, raw);
    if (error) return error;
    // The seat's live process runs with its own settings: a cap asked for here could not hold.
    if (req.maxBudgetUsd !== undefined) return badRequest("budget_not_supported");

    const convId = req.conversationId ?? db.ensureConversation(req.agentId, req.instanceId || "default", req.projectId ?? null).id;
    const { runId } = await conversation.sendMessageForRun(convId, req.prompt, conversationRunner.productionConversationRunner, req.contextProfile);
    return Response.json({ runId, conversationId: convId });
  } catch (e) {
    if (e instanceof conversation.DeliveryError) {
      return Response.json({ error: e.code, detail: e.message }, { status: e.status });
    }
    // Not Next's bodyless 500, which leaves no trace on disk: surface the message and record it.
    const err = e instanceof Error ? e : new Error(String(e));
    log.error("summon.failed", { message: err.message, stack: err.stack });
    return serverError(err.message);
  }
}
