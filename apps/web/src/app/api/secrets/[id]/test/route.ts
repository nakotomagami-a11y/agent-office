// POST /api/secrets/<id>/test — run the secret's test command with the secret in
// env; persists last_tested_at + last_test_ok. No test command → { skipped: true }.
import { NextResponse } from "next/server";
import { secrets, paths } from "@agent-office/domain/services";
import { badRequest, notFound } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!paths.isValidIdSegment(id)) return badRequest("invalid_id");
  const result = secrets.test(id);
  if (!result) return notFound();
  return NextResponse.json(result);
}
