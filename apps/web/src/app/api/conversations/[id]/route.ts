// GET /api/conversations/<id> — full view (turns + queue) of one conversation.
// Self-healing: reconciles a stale activeRunId (e.g. a server-restart orphan
// the finalizeRun listener never got a chance to see) before returning.
import { conversation, conversationRunner } from "@agent-office/domain/services";
import { validateIdParam, tryService } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  return tryService(() => conversation.getReconciledView(id, conversationRunner.productionConversationRunner));
}
