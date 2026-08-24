// POST /api/cleanup/<kind> — run a named maintenance cleanup task; <kind> must be
// one of CLEANUP_KINDS.
import { NextResponse } from "next/server";
import { cleanup } from "@agent-office/domain/services";
import { isCleanupKind } from "@agent-office/domain/config/cleanup";
import { badRequest } from "@/lib/api-helpers";

type Params = { params: Promise<{ kind: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { kind } = await params;
  if (!isCleanupKind(kind)) return badRequest(`unknown cleanup kind: ${kind}`);
  const result = cleanup.runCleanup(kind);
  return NextResponse.json(result);
}
