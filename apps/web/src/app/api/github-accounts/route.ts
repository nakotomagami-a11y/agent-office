// /api/github-accounts — registry of GitHub accounts (each its own GH_CONFIG_DIR).
// GET lists them with status; POST provisions a new empty one for the user to log into.
import { NextResponse } from "next/server";
import { githubAccounts } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { githubAccountCreateSchema } from "@/lib/validation-schemas";
import { requireIntegration } from "@/lib/api-helpers";

// Returns every registered github account with its logged-in username + ready
// flag so the settings page can render status badges in one round-trip.
export async function GET() {
  const gate = requireIntegration("github");
  if (gate) return gate;
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
  const gate = requireIntegration("github");
  if (gate) return gate;
  const raw: unknown = await request.json();
  const { data, error } = validateBody(githubAccountCreateSchema, raw);
  if (error) return error;
  const account = githubAccounts.create({ label: data.label });
  return NextResponse.json(account, { status: 201 });
}
