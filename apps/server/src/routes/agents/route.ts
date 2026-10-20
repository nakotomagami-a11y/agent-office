// GET /api/agents — list all agent definitions. POST — create one from a validated
// body (id derived from the body); an id that is taken is a 409 `agent_exists`.
import { agents } from "@agent-office/domain/services";
import { validateBody } from "../../lib/validation";
import { agentBodySchema } from "@agent-office/api-contract";

export async function GET() {
  return Response.json(agents.listAgents());
}

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data: body, error } = validateBody(agentBodySchema, raw);
  if (error) return error;
  const result = agents.createAgent(body);
  if (!result.ok) return Response.json({ error: result.error, id: body.id }, { status: result.status });
  return Response.json({ id: result.value });
}
