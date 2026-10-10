// GET /api/templates — the bundled agent starter templates.
import { templates } from "@agent-office/domain/services";

export async function GET() {
  return Response.json(templates.AGENT_TEMPLATES);
}
