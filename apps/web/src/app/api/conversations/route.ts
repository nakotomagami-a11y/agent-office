// GET  /api/conversations?agentId&instanceId — current conversation for a slot
//      (agent+instance), or null if the slot has never had one. Read-only.
// POST /api/conversations { agentId, instanceId?, projectId? } — get-or-create
//      the slot's current conversation.
// See docs/chat-refactor.md.
import { NextResponse } from "next/server";
import { conversation, conversationRunner, db } from "@agent-office/domain/services";
import { validateBody, validateQuery } from "@/lib/validation";
import { conversationCreateSchema, conversationQuerySchema } from "@/lib/validation-schemas";
import { tryService } from "@/lib/api-helpers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { data, error } = validateQuery(conversationQuerySchema, searchParams);
  if (error) return error;
  const instanceId = data.instanceId || "default";
  const row = db.getActiveConversation(data.agentId, instanceId);
  if (!row) return NextResponse.json(null);
  return tryService(() => conversation.getReconciledView(row.id, conversationRunner.productionConversationRunner));
}

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(conversationCreateSchema, raw);
  if (error) return error;
  return tryService(() =>
    conversation.ensureConversationView(
      data.agentId,
      data.instanceId || "default",
      data.projectId ?? null,
      conversationRunner.productionConversationRunner,
    ),
  );
}
