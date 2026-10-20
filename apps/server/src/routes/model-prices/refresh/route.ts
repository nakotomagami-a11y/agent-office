// POST /api/model-prices/refresh — re-fetch the price catalog. No catalog yet: answers the empty one.
import type { ModelPricesResponse } from "@agent-office/domain/types";

export async function POST() {
  const empty: ModelPricesResponse = { source: null, fetchedAt: null, stale: false, entries: {} };
  return Response.json(empty);
}
