// GET/PUT/DELETE /api/agent-docs/<owner>/<slug> — read, upsert, or delete one
// agent doc. `owner` is an agent-id or the `_global` sentinel (validated by the
// docs service, which owns that invariant).
import { NextResponse } from "next/server";
import { docs, paths } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { docUpsertSchema } from "@/lib/validation-schemas";
import { badRequest, notFound } from "@/lib/api-helpers";

type Params = { params: Promise<{ owner: string; slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { owner, slug } = await params;
  if (!docs.isValidOwner(owner)) return badRequest("invalid owner");
  if (!paths.isValidIdSegment(slug)) return badRequest("invalid slug");
  const doc = docs.readDoc(owner, slug);
  if (!doc) return notFound();
  return NextResponse.json(doc);
}

export async function PUT(request: Request, { params }: Params) {
  const { owner, slug } = await params;
  if (!docs.isValidOwner(owner)) return badRequest("invalid owner");
  if (!paths.isValidIdSegment(slug)) return badRequest("invalid slug");
  const raw: unknown = await request.json();
  const { data, error } = validateBody(docUpsertSchema, raw);
  if (error) return error;
  const doc = docs.upsertDoc({ owner, slug, ...data });
  return NextResponse.json(doc);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { owner, slug } = await params;
  if (!docs.isValidOwner(owner)) return badRequest("invalid owner");
  if (!paths.isValidIdSegment(slug)) return badRequest("invalid slug");
  docs.deleteDoc(owner, slug);
  return new NextResponse(null, { status: 204 });
}
