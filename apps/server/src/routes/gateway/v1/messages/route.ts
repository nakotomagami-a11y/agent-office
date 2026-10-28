// POST /api/gateway/v1/messages — the Anthropic Messages endpoint agents on a non-subscription provider use.
import { handleGatewayMessages } from "../../../../lib/gateway";

export async function POST(request: Request) {
  return handleGatewayMessages(request);
}
