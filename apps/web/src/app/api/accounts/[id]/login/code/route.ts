// POST /api/accounts/<id>/login/code — feed the pasted OAuth authorization code
// to the waiting `claude auth login` process for this account.
import { NextResponse } from "next/server";
import { accountLogin, paths } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { accountLoginCodeSchema } from "@/lib/validation-schemas";
import { badRequest, serverError } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  if (!paths.isValidIdSegment(id)) return badRequest("invalid_id");
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest("invalid_json");
  }
  const { data, error } = validateBody(accountLoginCodeSchema, raw);
  if (error) return badRequest("code_required");
  try {
    return NextResponse.json(accountLogin.submitCode(id, data.code));
  } catch (err) {
    return serverError(String(err));
  }
}
