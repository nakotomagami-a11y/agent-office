import { NextResponse } from "next/server";
import { accounts } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { accountCreateSchema } from "@/lib/validation-schemas";

// Returns every registered account with its plan + ready flag so the settings
// page can render the status badges in one round-trip.
export async function GET() {
  const enriched = accounts
    .list()
    .map((a) => accounts.getStatus(a.id))
    .filter(<T>(v: T | null): v is T => v !== null);
  return NextResponse.json(enriched);
}

// Create a new (empty) account. The dir is provisioned with symlinks to shared
// assets; the credentials file lands there when the user runs
// `CLAUDE_CONFIG_DIR=<dir> claude` — polled via `/api/accounts/<id>/status`.
export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(accountCreateSchema, raw);
  if (error) return error;
  const account = accounts.create({ label: data.label });
  return NextResponse.json(account, { status: 201 });
}
