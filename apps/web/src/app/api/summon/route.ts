// POST /api/summon — spawn a `claude -p` agent run and stream it over SSE.
import { NextResponse } from "next/server";
import { conversation, db, summonRun } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { summonRequestSchema } from "@/lib/validation-schemas";
import { badRequest, serverError } from "@/lib/api-helpers";
import { log } from "@agent-office/domain/services/infra/log";

export async function POST(request: Request) {
  try {
    const raw: unknown = await request.json();
    const { data: parsed, error } = validateBody(summonRequestSchema, raw);
    if (error) return error;

    // Without this a direct POST leaves conversation_id null, so the chat never finds the run.
    const req = parsed.conversationId ? parsed : {
      ...parsed,
      conversationId: db.ensureConversation(parsed.agentId, parsed.instanceId || "default", parsed.projectId ?? null).id,
    };

    const result = await summonRun.startSummonRun(req);
    if ("error" in result) {
      if (result.error.code) {
        return NextResponse.json({ error: result.error.code, detail: result.error.message }, { status: result.error.status });
      }
      return badRequest(result.error.message);
    }
    if (req.conversationId) conversation.attachExternalRun(req.conversationId, result.runId);
    return NextResponse.json({ runId: result.runId });
  } catch (e) {
    // Without this the throw becomes Next's bodyless 500, which the client
    // renders as the useless "Internal Server Error" and leaves no trace on
    // disk. Surface the real message and record it.
    const err = e instanceof Error ? e : new Error(String(e));
    log.error("summon.failed", { message: err.message, stack: err.stack });
    return serverError(err.message);
  }
}
