// GET /api/runs/<id> — read one persisted run record.
import { runs, store } from "@agent-office/domain/services";
import { notFound, validateIdParam } from "../../../lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  // Check in-flight runs first - a just-started run lives only in memory
  // until it finishes and gets written to runs.log.
  const live = runs.getLiveRunAsPersistedRun(id);
  if (live) return Response.json(live);
  const run = store.getRun(id);
  if (!run) return notFound();
  return Response.json(run);
}
