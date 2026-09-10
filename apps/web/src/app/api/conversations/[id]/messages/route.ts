// POST /api/conversations/<id>/messages { text } — start-or-queue a user
// message on this conversation (see docs/chat-refactor.md). The idle/running/
// needs_attention split is decided entirely by the pure conversation machine;
// this route is a thin pass-through.
import { conversation, conversationRunner } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { conversationMessageSchema } from "@/lib/validation-schemas";
import { validateIdParam, tryService } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { value: id, error: idError } = validateIdParam((await params).id);
  if (idError) return idError;

  const raw: unknown = await request.json();
  const { data, error } = validateBody(conversationMessageSchema, raw);
  if (error) return error;

  return tryService(() =>
    conversation.sendMessageToConversation(id, data.text, conversationRunner.productionConversationRunner, data.contextProfile),
  );
}
