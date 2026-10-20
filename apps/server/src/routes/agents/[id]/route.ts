// GET/PUT/DELETE /api/agents/<id> — read, overwrite, or delete one agent and its sessions (?work=).
// PUT snapshots the current body to a timestamped history file (max 10) first.
import { agents, projects } from "@agent-office/domain/services";
import { validateBody, validateQuery } from "../../../lib/validation";
import { agentBodySchema, sessionRemovalQuerySchema } from "@agent-office/api-contract";
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
  const { data: body, error } = validateBody(agentBodySchema, raw);
  if (error) return error;

  // Back up current body text before overwriting
  const current = agents.readAgent(id);
  if (current?.body) {
    agents.backupAgentBody(id, current.body);
  }

  return tryService(() => ({ id: agents.writeAgent({ ...body, id }) }));
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
