import { NextResponse } from "next/server";
import { projects, db as dbService } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { rosterPatchSchema } from "@/lib/validation-schemas";
import { notFound, tryService, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string; instanceId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id, instanceId } = await params;
  const idCheck = validateIdParam(id);
  if (idCheck.error) return idCheck.error;
  const instCheck = validateIdParam(instanceId);
  if (instCheck.error) return instCheck.error;

  const project = projects.readProject(idCheck.value);
  if (!project) return notFound();
  const instance = project.meta.roster.find((i) => i.instanceId === instCheck.value);
  if (!instance) return notFound();

  const spend = dbService.getSpendForInstance(instance.agentId, instCheck.value);
  return NextResponse.json({ ...instance, spend });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id, instanceId } = await params;
  const idCheck = validateIdParam(id);
  if (idCheck.error) return idCheck.error;
  const instCheck = validateIdParam(instanceId);
  if (instCheck.error) return instCheck.error;
  const raw: unknown = await request.json();
  const { data, error } = validateBody(rosterPatchSchema, raw);
  if (error) return error;
  return tryService(() => projects.patchInstance(idCheck.value, instCheck.value, data));
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id, instanceId } = await params;
  const idCheck = validateIdParam(id);
  if (idCheck.error) return idCheck.error;
  const instCheck = validateIdParam(instanceId);
  if (instCheck.error) return instCheck.error;
  return tryService(() => projects.removeInstance(idCheck.value, instCheck.value));
}
