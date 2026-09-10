// POST /api/conversations/<id>/new — "New thread": start a fresh conversation
// for the same (agentId, instanceId) slot as `id`, with a null session. The
// old conversation and its queue are abandoned intact, not deleted.
import { conversation } from "@agent-office/domain/services";
import { validateIdParam, tryService } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  return tryService(() => conversation.newThreadFromConversation(id));
}
