// GET /api/projects — list project summaries. POST — create a project from a
// validated body (registers it and provisions its ~/.claude/projects/<id> dir).
import { projects } from "@agent-office/domain/services";
import { validateBody } from "../../lib/validation";
import { createProjectSchema } from "@agent-office/api-contract";
import { tryService } from "../../lib/api-helpers";

export async function GET() {
  return Response.json(projects.listProjectSummaries());
}

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(createProjectSchema, raw);
  if (error) return error;
  return tryService(() => projects.createProject(data));
}
