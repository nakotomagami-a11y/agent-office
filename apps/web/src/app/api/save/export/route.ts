// GET /api/save/export — export a project, its agents, and (optionally)
// transcripts as a portable JSON bundle download.
import { save } from "@agent-office/domain/services";
import { badRequest, notFound } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const includeHistory = searchParams.get("history") === "1";

  if (!projectId) return badRequest("projectId_required");

  const bundle = save.exportBundle(projectId, includeHistory);
  if (!bundle) return notFound();

  const slug = (bundle.project.meta.name as string | undefined)?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? projectId;
  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${slug}-agent-office.json"`,
    },
  });
}
