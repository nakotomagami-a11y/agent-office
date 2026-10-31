// POST /api/schedules/<id>/run — fire a scheduled job immediately, bypassing the
// staleness cap ("run anyway" from the >12h-overdue confirmation).
import { scheduler } from "@agent-office/domain/services";
import { conflict, notFound, validateIdParam } from "../../../../lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const job = await scheduler.runNow(id);
  if (job === "not_runnable") return conflict("schedule_not_runnable");
  return job ? Response.json({ job }) : notFound();
}
