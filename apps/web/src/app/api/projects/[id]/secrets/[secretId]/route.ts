// DELETE /api/projects/<id>/secrets/<secretId> — detach a secret from a project.
// The secret itself is left intact (still available to other projects). Idempotent.
import { NextResponse } from "next/server";
import { secrets, paths } from "@agent-office/domain/services";
import { badRequest } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string; secretId: string }> };

// Detach a secret from this project. The secret itself is untouched (still
// exists for other projects). Idempotent.
export async function DELETE(_request: Request, { params }: Params) {
  const { id, secretId } = await params;
  if (!paths.isValidIdSegment(id) || !paths.isValidIdSegment(secretId)) return badRequest("invalid_id");
  secrets.unlink(id, secretId);
  return new NextResponse(null, { status: 204 });
}
