// GET /api/workflows — list saved multi-step prompt workflows. POST — save a new one.
import { store } from "@agent-office/domain/services";
import { validateBody, validateQuery } from "../../lib/validation";
import { workflowCreateSchema, workflowsQuerySchema } from "@agent-office/api-contract";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { data, error } = validateQuery(workflowsQuerySchema, url.searchParams);
  if (error) return error;
  return Response.json(store.getWorkflows({ q: data.q, category: data.category }));
}

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(workflowCreateSchema, raw);
  if (error) return error;
  const workflow = store.createWorkflow({ title: data.title, body: data.body, category: data.category });
  return Response.json(workflow, { status: 201 });
}
