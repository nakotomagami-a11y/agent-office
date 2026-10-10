// GET /api/health — liveness probe for the app (polled by the client).
import { health } from "@agent-office/domain/services";
import { validateQuery } from "../../lib/validation";
import { healthQuerySchema } from "@agent-office/api-contract";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { data: q, error } = validateQuery(healthQuerySchema, url.searchParams);
  if (error) return error;
  return Response.json(await health.getHealth(q.force));
}
