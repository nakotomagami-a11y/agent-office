// GET /api/agents/<id>/body — the agent's system-prompt body, without frontmatter.
// Edits go through PUT /api/agents/<id>, which keeps the frontmatter it does not own.
import { agents } from "@agent-office/domain/services";
import { notFound, validateIdParam } from "../../../../lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const agent = agents.readAgent(id);
  if (!agent) return notFound();
  return new Response(agent.body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
