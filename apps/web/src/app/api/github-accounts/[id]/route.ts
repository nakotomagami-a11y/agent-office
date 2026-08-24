// PATCH/DELETE /api/github-accounts/<id> — rename or remove a single GitHub account.
// DELETE refuses the `default` account and any account still referenced by a project.
import { NextResponse } from "next/server";
import { match } from "ts-pattern";
import { githubAccounts } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { githubAccountPatchSchema } from "@/lib/validation-schemas";
import { notFound, validateIdParam, requireIntegration } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const gate = requireIntegration("github");
  if (gate) return gate;
  const { value: id, error: idError } = validateIdParam((await params).id);
  if (idError) return idError;
  const raw: unknown = await request.json();
  const { data, error } = validateBody(githubAccountPatchSchema, raw);
  if (error) return error;
  const existing = githubAccounts.get(id);
  if (!existing) return notFound();
  return NextResponse.json(githubAccounts.rename(id, data.label));
}

export async function DELETE(_request: Request, { params }: Params) {
  const gate = requireIntegration("github");
  if (gate) return gate;
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const result = githubAccounts.remove(id);
  if (result.ok) return new NextResponse(null, { status: 204 });
  return match(result.reason)
    .with("not_found", () => notFound())
    .with("default", () => NextResponse.json({ error: "cannot_remove_default" }, { status: 400 }))
    .with("referenced", () =>
      NextResponse.json({ error: "github_account_referenced", blockedBy: result.blocked ?? [] }, { status: 409 }),
    )
    .otherwise(() => NextResponse.json({ error: "unknown" }, { status: 500 }));
}
