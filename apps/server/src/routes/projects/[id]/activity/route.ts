// GET /api/projects/<id>/activity — run count, failures and known cost per fixed-size
// time bucket, plus window and prior-window totals, for the dashboard's Activity card.
// Query: start (epoch ms), bucketMs (≥ 60 000), count (1–100).
import { projectActivity } from "@agent-office/domain/services";
import { projectActivityQuerySchema } from "@agent-office/api-contract";
import { validateIdParam } from "../../../../lib/api-helpers";
import { validateQuery } from "../../../../lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { value: projectId, error } = validateIdParam((await params).id);
  if (error) return error;
  const { data: q, error: queryError } = validateQuery(projectActivityQuerySchema, new URL(request.url).searchParams);
  if (queryError) return queryError;

  return Response.json(projectActivity.getProjectActivity({ projectId, ...q }));
}
