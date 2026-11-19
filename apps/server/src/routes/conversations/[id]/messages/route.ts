// POST /api/conversations/<id>/messages { text } — send a user message to the
// conversation's agent: its live process reads it at once, mid-turn or as the
// next turn (see docs/chat-refactor.md). A message no agent could get is its
// error code (`DeliveryError`).
import { conversation, conversationRunner } from "@agent-office/domain/services";
import { validateBody } from "../../../../lib/validation";
import { conversationMessageSchema } from "@agent-office/api-contract";
import { validateIdParam, tryService } from "../../../../lib/api-helpers";

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
