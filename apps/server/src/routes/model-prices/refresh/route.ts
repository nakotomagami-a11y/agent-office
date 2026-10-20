// POST /api/model-prices/refresh — re-fetch the catalog now. One upstream attempt per minute (429
// otherwise); 409 price_fetch_disabled when the switch is off; 502 when both sources failed.
import { providers } from "@agent-office/domain/services";
import { conflict } from "../../../lib/api-helpers";

const STATUS = { rate_limited: 429, price_fetch_failed: 502 } as const;

export async function POST() {
  const result = await providers.refreshPrices();
  if (result.ok) return Response.json(result.view);
  if (result.error === "price_fetch_disabled") return conflict(result.error);
  return Response.json({ error: result.error }, { status: STATUS[result.error] });
}
