import { NextResponse } from "next/server";
import { secrets, paths } from "@agent-office/domain/services";
import { badRequest, notFound } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

// Run the secret's test command with the secret in env and report the live
// result. Persists last_tested_at + last_test_ok. Secrets with no test command
// return `{ skipped: true }`.
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!paths.isValidIdSegment(id)) return badRequest("invalid_id");
  const result = secrets.test(id);
  if (!result) return notFound();
  return NextResponse.json(result);
}
