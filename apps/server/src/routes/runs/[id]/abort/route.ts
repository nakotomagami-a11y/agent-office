// POST /api/runs/<id>/abort — abort a running run (kills its child process).
import { runs } from "@agent-office/domain/services";
import { validateIdParam } from "../../../../lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const ok = runs.abortRun(id);
  return Response.json({ aborted: ok });
}
