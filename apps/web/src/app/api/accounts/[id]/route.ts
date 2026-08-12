import { NextResponse } from "next/server";
import { accounts, paths } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { accountPatchSchema } from "@/lib/validation-schemas";
import { badRequest, notFound } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

// The `default` id contains no dot/underscore and is a legal segment, so we
// don't need a sentinel bypass like agent-docs uses for `_global`.
function guardId(id: string): boolean {
  return paths.isValidIdSegment(id);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  if (!guardId(id)) return badRequest("invalid_id");
  const raw: unknown = await request.json();
  const { data, error } = validateBody(accountPatchSchema, raw);
  if (error) return error;
  const existing = accounts.get(id);
  if (!existing) return notFound();
  const updated = accounts.rename(id, data.label);
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!guardId(id)) return badRequest("invalid_id");
  const result = accounts.remove(id);
  if (result.ok) return new NextResponse(null, { status: 204 });
  if (result.reason === "not_found") return notFound();
  if (result.reason === "default") {
    return NextResponse.json(
      { error: "cannot_remove_default" },
      { status: 400 },
    );
  }
  if (result.reason === "referenced") {
    return NextResponse.json(
      { error: "account_referenced", blockedBy: result.blocked ?? [] },
      { status: 409 },
    );
  }
  return NextResponse.json({ error: "unknown" }, { status: 500 });
}
