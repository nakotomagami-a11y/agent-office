// GET/PUT/DELETE /api/agents/<id> — read, overwrite, or delete one agent.
// PUT snapshots the current body to a timestamped history file (max 10) first.
import { NextResponse } from "next/server";
import { agents } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { agentBodySchema } from "@/lib/validation-schemas";
import { notFound, tryService, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const agent = agents.readAgent(id);
  if (!agent) return notFound();
  return NextResponse.json(agent.info);
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

export async function DELETE(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const ok = agents.deleteAgent(id);
  return ok ? NextResponse.json({ deleted: id }) : notFound();
}
