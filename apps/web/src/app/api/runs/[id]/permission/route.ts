// POST /api/runs/<id>/permission
//   from the MCP bridge: park a tool call and block until the user answers.
// PATCH /api/runs/<id>/permission
//   from the chat UI: answer a parked request.
// GET   /api/runs/<id>/permission
//   anything still parked for this run (UI recovery after a reload).
import { NextResponse } from "next/server";
import { permissions, runs } from "@agent-office/domain/services";
import type { PermissionRequest } from "@agent-office/domain/services/execution/permissions";
import { validateIdParam, badRequest } from "@/lib/api-helpers";
import { validateBody } from "@/lib/validation";
import { permissionRequestSchema, permissionDecisionSchema } from "@/lib/validation-schemas";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: Params) {
  const { value: runId, error } = validateIdParam((await params).id);
  if (error) return error;
  return NextResponse.json({ pending: permissions.listPending(runId) });
}

export async function POST(request: Request, { params }: Params) {
  const { value: runId, error: idError } = validateIdParam((await params).id);
  if (idError) return idError;

  const raw: unknown = await request.json();
  const { data, error } = validateBody(permissionRequestSchema, raw);
  if (error) return error;

  // A request for a run that is not live can never be answered — deny rather
  // than park it forever.
  if (!runs.isRunLive(runId)) {
    return NextResponse.json({ decision: "deny", reason: "run_not_live" });
  }

  const decision = await permissions.requestPermission({
    runId,
    tool: data.tool,
    input: data.input,
    onCreated: (req: PermissionRequest) => runs.broadcastPermissionRequest(runId, req),
  });
  return NextResponse.json({ decision });
}

export async function PATCH(request: Request, { params }: Params) {
  const { error: idError } = validateIdParam((await params).id);
  if (idError) return idError;

  const raw: unknown = await request.json();
  const { data, error } = validateBody(permissionDecisionSchema, raw);
  if (error) return error;

  if (!permissions.resolvePermission(data.id, data.decision)) {
    // Already answered, timed out, or never existed. Not an error — a double
    // click must not 500.
    return badRequest("permission_not_pending");
  }
  return NextResponse.json({ ok: true });
}
