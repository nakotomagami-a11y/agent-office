// GET /api/docs/export — machine-readable export of the app's API + schema surface.
import { buildDocsExport } from "@agent-office/domain/services/docs/docs-export";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(buildDocsExport());
}
