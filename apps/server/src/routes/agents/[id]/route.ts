// GET/PUT/DELETE /api/agents/<id> — read, update, or delete one agent and its sessions (?work=). PUT edits an
// existing <id>.md only (404 otherwise), changes only the keys sent, and snapshots a changed body.
import { agents, projects } from "@agent-office/domain/services";
import { validateBody, validateQuery } from "../../../lib/validation";
import { agentUpdateSchema, sessionRemovalQuerySchema } from "@agent-office/api-contract";
import { notFound, tryService, validateIdParam } from "../../../lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const agent = agents.readAgent(id);
  if (!agent) return notFound();
  return Response.json(agent.info);
}

export async function PUT(request: Request, { params }: Params) {
  const { value: id, error: paramError } = validateIdParam((await params).id);
  if (paramError) return paramError;
  const raw: unknown = await request.json();
  const { data: patch, error } = validateBody(agentUpdateSchema, raw);
  if (error) return error;

  return tryService(() => {
    const result = agents.updateAgent(id, patch);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return { id: result.value };
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const query = validateQuery(sessionRemovalQuerySchema, new URL(request.url).searchParams);
  if (query.error) return query.error;
  if (!agents.readAgent(id)) return notFound();
  return tryService(() => {
    projects.removeAgentSessions(id, query.data.work);
    agents.deleteAgent(id);
    return { deleted: id };
  });
}
