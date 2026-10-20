// POST /api/model-prices/refresh — re-fetch the price catalog. No catalog yet: answers the empty one.
import { EMPTY_CATALOG } from "../../../lib/model-prices";

export async function POST() {
  return Response.json(EMPTY_CATALOG);
}
