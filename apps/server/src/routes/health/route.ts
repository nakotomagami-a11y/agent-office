// GET /api/health — liveness probe (polled by the client) + the AI provider in force, no network.
import { health, providers } from "@agent-office/domain/services";
import { validateQuery } from "../../lib/validation";
import { healthQuerySchema } from "@agent-office/api-contract";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { data: q, error } = validateQuery(healthQuerySchema, url.searchParams);
  if (error) return error;
  const { provider, available, reason } = providers.currentProvider();
  return Response.json({ ...(await health.getHealth(q.force)), provider: { selected: provider, available, reason } });
}
