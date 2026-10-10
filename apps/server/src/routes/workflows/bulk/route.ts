// POST /api/workflows/bulk — import many saved workflows in one call.
import { store } from "@agent-office/domain/services";
import { validateBody } from "../../../lib/validation";
import { workflowsBulkSchema } from "@agent-office/api-contract";

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(workflowsBulkSchema, raw);
  if (error) return error;
  const inserted = store.bulkInsertWorkflows(data.workflows);
  return Response.json({ inserted });
}
