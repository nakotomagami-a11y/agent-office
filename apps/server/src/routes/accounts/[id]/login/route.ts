// /api/accounts/<id>/login — drive the `claude auth login` flow for one account:
// POST starts it, GET polls login state (for the sign-in modal), DELETE cancels.
import { accountLogin, paths } from "@agent-office/domain/services";
import { badRequest, serverError } from "../../../../lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

// POST → spawn `claude auth login` for this account, return the login state
// (phase + OAuth url once the CLI prints it).
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!paths.isValidIdSegment(id)) return badRequest("invalid_id");
  try {
    return Response.json(accountLogin.startLogin(id));
  } catch (err) {
    return serverError(String(err));
  }
}

// GET → poll target for the sign-in modal.
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!paths.isValidIdSegment(id)) return badRequest("invalid_id");
  const state = accountLogin.getLoginState(id);
  return Response.json(state ?? { phase: "starting" });
}

// DELETE → cancel an in-flight login.
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!paths.isValidIdSegment(id)) return badRequest("invalid_id");
  accountLogin.cancelLogin(id);
  return Response.json({ ok: true });
}
