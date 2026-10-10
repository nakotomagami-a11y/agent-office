// GET /api/agents — list all agent definitions. POST — create or overwrite one
// from a validated body (id derived from the body).
import { agents } from "@agent-office/domain/services";
import { validateBody } from "../../lib/validation";
import { agentBodySchema } from "@agent-office/api-contract";
import { tryService } from "../../lib/api-helpers";

export async function GET() {
  return Response.json(agents.listAgents());
}

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data: body, error } = validateBody(agentBodySchema, raw);
  if (error) return error;
  return tryService(() => ({ id: agents.writeAgent(body) }));
}
