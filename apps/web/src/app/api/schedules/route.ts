import { NextResponse } from "next/server";
import { scheduler } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { createScheduleSchema } from "@/lib/validation-schemas";

export async function GET() {
  return NextResponse.json({ jobs: scheduler.listJobs() });
}

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(createScheduleSchema, raw);
  if (error) return error;
  const job = scheduler.createJob(data);
  return NextResponse.json({ job }, { status: 201 });
}
