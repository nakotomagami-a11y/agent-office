// DELETE /api/conversations/<id>/queue/<messageId> — remove one pending item.
import { conversation } from "@agent-office/domain/services";
import { validateIdParam, tryService } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string; messageId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { id: rawId, messageId: rawMessageId } = await params;
  const { value: id, error: idError } = validateIdParam(rawId);
  if (idError) return idError;
  const { value: messageId, error: msgError } = validateIdParam(rawMessageId);
  if (msgError) return msgError;
  return tryService(() => conversation.removeQueued(id, messageId));
}
