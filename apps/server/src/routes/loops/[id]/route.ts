// GET   /api/loops/<id> — current state. Reconciles a stale active run first,
//                          like the conversation view does.
// PATCH /api/loops/<id> — the user's three interventions.
import { loopRunner, loopProductionRunner, db } from "@agent-office/domain/services";
import { validateIdParam, tryService, notFound } from "../../../lib/api-helpers";
import { validateBody } from "../../../lib/validation";
import { loopActionSchema } from "@agent-office/api-contract";

type Params = { params: Promise<{ id: string }> };

/** RULE errors.machine-codes: every code carries what to do about it. */
function refusalDetail(code: string, action: string): string {
  switch (code) {
    case "action_not_accepted":
      return `"${action}" does not apply in this loop's current phase. Reload to see where it is now.`;
    case "write_conflict":
      return "The loop changed while this was in flight. Reload and try again.";
    case "dispatch_retrying":
      return "The next round could not start yet and will be retried. Nothing was lost.";
    case "dispatch_failed":
      return "The next round could not be started. The work so far is intact.";
    default:
      return "This loop could not be advanced.";
  }
}

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
  // Wrapped: `reduceLoop` and the DB write sit outside advanceLoop's own catch,
  // so a locked/full sqlite would otherwise escape as an unshaped 500.
  let result: Awaited<ReturnType<typeof loopRunner.advanceLoop>>;
  try {
    result = await loopRunner.advanceLoop(
      id, { type: data.action }, loopProductionRunner.productionLoopRunner, Date.now(),
    );
  } catch {
    return Response.json({ error: "loop_advance_failed", detail: "The loop could not be advanced. Reload and try again." }, { status: 500 });
  }
  if (!result.ok) {
    // 409, not 200: a refused action returned as success is a button that
    // silently does nothing and a UI that cannot tell.
    return Response.json(
      { error: result.code, detail: refusalDetail(result.code, data.action) },
      { status: 409 },
    );
  }
  return tryService(() => db.getLoop(id));
}
