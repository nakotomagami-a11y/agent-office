// GET/POST /api/projects/<id>/secrets — list the secrets attached to a project
// (read path carries no raw values), or attach an existing secret to it. Idempotent.
import { NextResponse } from "next/server";
import { secrets, paths } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { projectSecretLinkSchema } from "@/lib/validation-schemas";
import { badRequest, notFound } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

// Secrets attached to this project (read-path shape — no raw values).
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!paths.isValidIdSegment(id)) return badRequest("invalid_id");
  return NextResponse.json(secrets.listForProject(id));
}

// Attach an existing secret to this project — the "bring a key to another
// project" flow. Idempotent.
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  if (!paths.isValidIdSegment(id)) return badRequest("invalid_id");
  const raw: unknown = await request.json();
  const { data, error } = validateBody(projectSecretLinkSchema, raw);
  if (error) return error;
  if (!secrets.link(id, data.secretId)) return notFound("secret_not_found");
  return NextResponse.json(secrets.listForProject(id), { status: 201 });
}
