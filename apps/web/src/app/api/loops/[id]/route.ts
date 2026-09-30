// GET   /api/loops/<id> — current state. Reconciles a stale active run first,
//                          like the conversation view does.
// PATCH /api/loops/<id> — the user's three interventions.
import { loopRunner, loopProductionRunner, db } from "@agent-office/domain/services";
import { validateIdParam, tryService, notFound } from "@/lib/api-helpers";
import { validateBody } from "@/lib/validation";
import { loopActionSchema } from "@/lib/validation-schemas";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  if (!db.getLoop(id)) return notFound("loop_not_found");
  return tryService(async () => {
    await loopRunner.reconcileLoopIfStale(id, loopProductionRunner.productionLoopRunner, Date.now());
    return db.getLoop(id);
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const { value: id, error: idError } = validateIdParam((await params).id);
  if (idError) return idError;
  const raw: unknown = await request.json();
  const { data, error } = validateBody(loopActionSchema, raw);
  if (error) return error;
  if (!db.getLoop(id)) return notFound("loop_not_found");
  return tryService(async () => {
    await loopRunner.advanceLoop(id, { type: data.action }, loopProductionRunner.productionLoopRunner, Date.now());
    return db.getLoop(id);
  });
}
