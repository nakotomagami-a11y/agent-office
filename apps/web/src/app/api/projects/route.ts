import { NextResponse } from "next/server";
import { projects } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { createProjectSchema } from "@/lib/validation-schemas";
import { tryService } from "@/lib/api-helpers";

export async function GET() {
  return NextResponse.json(projects.listProjectSummaries());
}

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(createProjectSchema, raw);
  if (error) return error;
  return tryService(() => projects.createProject(data));
}
