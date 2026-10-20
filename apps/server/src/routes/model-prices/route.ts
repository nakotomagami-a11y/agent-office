// GET /api/model-prices — per-model prices with their source and date. No catalog yet: every price is unknown.
import type { ModelPricesResponse } from "@agent-office/domain/types";

const EMPTY_CATALOG: ModelPricesResponse = { source: null, fetchedAt: null, stale: false, entries: {} };

export async function GET() {
  return Response.json(EMPTY_CATALOG);
}
