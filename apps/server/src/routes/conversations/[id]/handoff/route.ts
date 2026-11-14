// POST /api/conversations/<id>/handoff — "Continue in a fresh session": a new
// conversation for the same slot, started by a takeover prompt quoting the last
// reply; pending messages move with it. 409 with a code when it cannot: a turn is
// running, there is no turn yet, the conversation was replaced, or a loop drives it.
import { conversation, conversationRunner } from "@agent-office/domain/services";
import { conflict, validateIdParam, tryService } from "../../../../lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  return tryService(async () => {
    const result = await conversation.handOff(id, conversationRunner.productionConversationRunner);
    return "code" in result ? conflict(result.code) : result;
  });
}
