// PATCH/DELETE /api/accounts/<id> — rename or remove a single Claude account.
// DELETE refuses the `default` account and any account still referenced by a project.
import { NextResponse } from "next/server";
import { accounts } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { accountPatchSchema } from "@/lib/validation-schemas";
import { notFound, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { value: id, error: idError } = validateIdParam((await params).id);
  if (idError) return idError;
  const raw: unknown = await request.json();
  const { data, error } = validateBody(accountPatchSchema, raw);
  if (error) return error;
  const existing = accounts.get(id);
  if (!existing) return notFound();
  const updated = accounts.rename(id, data.label);
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const result = accounts.remove(id);
  if (result.ok) return new NextResponse(null, { status: 204 });
  switch (result.reason) {
    case "not_found":
      return notFound();
    case "default":
      return NextResponse.json({ error: "cannot_remove_default" }, { status: 400 });
    case "referenced":
      return NextResponse.json({ error: "account_referenced", blockedBy: result.blocked ?? [] }, { status: 409 });
    default:
      return NextResponse.json({ error: "unknown" }, { status: 500 });
  }
}
