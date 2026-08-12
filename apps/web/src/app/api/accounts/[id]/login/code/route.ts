import { NextResponse } from "next/server";
import { accountLogin, paths } from "@agent-office/domain/services";
import { badRequest, serverError } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

// POST { code } → feed the pasted authorization code to the waiting login proc.
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  if (!paths.isValidIdSegment(id)) return badRequest("invalid_id");
  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return badRequest("invalid_json");
  }
  if (typeof body.code !== "string" || !body.code.trim()) return badRequest("code_required");
  try {
    return NextResponse.json(accountLogin.submitCode(id, body.code));
  } catch (err) {
    return serverError(String(err));
  }
}
