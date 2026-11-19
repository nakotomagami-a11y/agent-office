// DELETE /api/conversations/<id>/queue — clear the agent queue (Agent Office's
// own messages waiting for idle). The only action that drops them (see
// docs/chat-refactor.md — a failed turn otherwise preserves the queue).
import { conversation } from "@agent-office/domain/services";
import { validateIdParam, tryService } from "../../../../lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  return tryService(() => conversation.clearQueue(id));
}
