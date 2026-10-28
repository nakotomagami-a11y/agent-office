// GET /api/model-prices — per-model prices with their source, date, staleness and the fetch switch.
import { providers } from "@agent-office/domain/services";

export async function GET() {
  return Response.json(providers.pricesView());
}
