import { NextResponse } from "next/server";
import { secrets, paths } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { secretPatchSchema } from "@/lib/validation-schemas";
import { badRequest, notFound } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  if (!paths.isValidIdSegment(id)) return badRequest("invalid_id");
  const raw: unknown = await request.json();
  const { data, error } = validateBody(secretPatchSchema, raw);
  if (error) return error;
  try {
    const updated = secrets.update(id, data);
    if (!updated) return notFound();
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String((err as Error).message) }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!paths.isValidIdSegment(id)) return badRequest("invalid_id");
  return secrets.remove(id) ? new NextResponse(null, { status: 204 }) : notFound();
}
