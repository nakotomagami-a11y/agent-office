import { NextResponse } from "next/server";
import { githubAccounts, paths } from "@agent-office/domain/services";
import { badRequest, notFound } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

// Poll target for the add-account modal: returns `{ ready, username? }` so the
// client can show "Waiting for login…" until `gh` reports an authenticated user
// for the account's config dir.
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!paths.isValidIdSegment(id)) return badRequest("invalid_id");
  const status = githubAccounts.getStatus(id);
  if (!status) return notFound();
  return NextResponse.json(status);
}
