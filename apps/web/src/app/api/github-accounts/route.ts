import { NextResponse } from "next/server";
import { githubAccounts } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { githubAccountCreateSchema } from "@/lib/validation-schemas";

// Returns every registered github account with its logged-in username + ready
// flag so the settings page can render status badges in one round-trip.
export async function GET() {
  const enriched = githubAccounts
    .list()
    .map((a) => githubAccounts.getStatus(a.id))
    .filter(<T>(v: T | null): v is T => v !== null);
  return NextResponse.json(enriched);
}

// Create a new (empty) github account. The dir is provisioned; the token lands
// there when the user runs `GH_CONFIG_DIR=<dir> gh auth login` — polled via
// `/api/github-accounts/<id>/status`.
export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(githubAccountCreateSchema, raw);
  if (error) return error;
  const account = githubAccounts.create({ label: data.label });
  return NextResponse.json(account, { status: 201 });
}
