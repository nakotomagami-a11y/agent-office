// POST /api/gateway/v1/messages/count_tokens — not offered: a 404 the CLI handles, never a made-up count.
import { gatewayError } from "../../../../../lib/gateway-errors";

export async function POST() {
  return gatewayError(404, "not_found_error", "count_tokens is not available through this gateway");
}
