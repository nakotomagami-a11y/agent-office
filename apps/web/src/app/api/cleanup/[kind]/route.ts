// POST /api/cleanup/<kind> — run a named maintenance cleanup task; <kind> must be
// one of CLEANUP_KINDS.
import { NextResponse } from "next/server";
import { cleanup } from "@agent-office/domain/services";
import { isCleanupKind } from "@agent-office/domain/config/cleanup";
import { badRequest } from "@/lib/api-helpers";
import { log } from "@agent-office/domain/services/infra/log";

type Params = { params: Promise<{ kind: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { kind } = await params;
  if (!isCleanupKind(kind)) return badRequest(`unknown cleanup kind: ${kind}`);
  try {
    return NextResponse.json(cleanup.runCleanup(kind));
  } catch (err) {
    // An opaque 500 the panel discarded made a FAILED wipe look like a misclick.
    log.error("cleanup.failed", { kind, err: String(err) });
    return NextResponse.json(
      { error: "cleanup_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
