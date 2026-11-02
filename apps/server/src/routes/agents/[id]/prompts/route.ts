// GET /api/agents/<id>/prompts — the agent's recent-prompt history, most recent first.
import { store } from "@agent-office/domain/services";
import { validateIdParam } from "../../../../lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  return Response.json(store.getRecentPrompts(id));
}
