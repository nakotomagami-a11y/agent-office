// GET /api/agents/<id>/body/history/<filename> — serve one body-history snapshot.
// Filename safety (must be `<id>.body.*.md`, no traversal) is enforced by the domain;
// an unsafe or missing filename is reported as 404.
import { agents } from "@agent-office/domain/services";
import { notFound, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string; filename: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id: rawId, filename: rawFilename } = await params;
  const { value: id, error } = validateIdParam(rawId);
  if (error) return error;

  const content = agents.readAgentBodySnapshot(id, decodeURIComponent(rawFilename));
  if (content === null) return notFound();
  return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
