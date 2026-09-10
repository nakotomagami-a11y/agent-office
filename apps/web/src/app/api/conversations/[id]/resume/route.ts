// POST /api/conversations/<id>/resume — a needs_attention turn: continue the
// session as a new turn. No-op (returns unchanged view) if not needs_attention.
import { conversation, conversationRunner } from "@agent-office/domain/services";
import { validateIdParam, tryService } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  return tryService(() => conversation.resume(id, conversationRunner.productionConversationRunner));
}
