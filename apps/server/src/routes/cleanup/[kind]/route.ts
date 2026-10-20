// POST /api/cleanup/<kind> — run a named maintenance cleanup task; <kind> must be
// one of CLEANUP_KINDS.
import { join } from "node:path";
import { cleanup } from "@agent-office/domain/services";
import { isCleanupKind } from "@agent-office/domain/config/cleanup";
import { badRequest } from "../../../lib/api-helpers";
import { resolveStarterDataDir } from "../../../lib/starter-data";
import { log } from "@agent-office/domain/services/infra/log";

type Params = { params: Promise<{ kind: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { kind } = await params;
  if (!isCleanupKind(kind)) return badRequest(`unknown cleanup kind: ${kind}`);
  try {
    const starter = resolveStarterDataDir();
    return Response.json(cleanup.runCleanup(kind, { bundledSkillsDir: starter && join(starter, "skills") }));
  } catch (err) {
    // An opaque 500 the panel discarded made a FAILED wipe look like a misclick.
    log.error("cleanup.failed", { kind, err: String(err) });
    return Response.json(
      { error: "cleanup_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
