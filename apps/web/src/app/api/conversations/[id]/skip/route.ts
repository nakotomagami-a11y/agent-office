// POST /api/conversations/<id>/skip — a needs_attention turn: discard the
// failed turn and advance to the next queued message (idle if none). No-op
// (returns unchanged view) if not needs_attention.
import { conversation, conversationRunner } from "@agent-office/domain/services";
import { validateIdParam, tryService } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  return tryService(() => conversation.skip(id, conversationRunner.productionConversationRunner));
}
