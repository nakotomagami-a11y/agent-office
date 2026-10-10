// PATCH/DELETE /api/schedules/<id> — update or cancel a scheduled job.
import { scheduler } from "@agent-office/domain/services";
import { notFound, validateIdParam } from "../../../lib/api-helpers";
import { validateBody } from "../../../lib/validation";
import { reassignScheduleSchema } from "@agent-office/api-contract";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  return scheduler.cancelJob(id) ? Response.json({ ok: true }) : notFound();
}

export async function PATCH(request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const raw: unknown = await request.json();
  const { data, error: bodyError } = validateBody(reassignScheduleSchema, raw);
  if (bodyError) return bodyError;
  const job = scheduler.reassignJob(id, data);
  return job ? Response.json({ job }) : notFound();
}
