// GET /api/schedules — list scheduled jobs. POST — schedule a summon to fire later.
import { scheduler } from "@agent-office/domain/services";
import { validateBody } from "../../lib/validation";
import { createScheduleSchema } from "@agent-office/api-contract";

export async function GET() {
  return Response.json({ jobs: scheduler.listJobs() });
}

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(createScheduleSchema, raw);
  if (error) return error;
  const job = scheduler.createJob(data);
  return Response.json({ job }, { status: 201 });
}
