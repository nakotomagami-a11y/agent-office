// GET /api/agent-docs — list every agent-authored doc across all owners (metadata
// only; bodies are fetched per-doc via /api/agent-docs/<owner>/<slug>).
import { docs } from "@agent-office/domain/services";

export async function GET() {
  return Response.json(docs.listDocs());
}
