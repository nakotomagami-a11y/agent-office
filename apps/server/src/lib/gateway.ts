// The in-process gateway agents on a non-subscription provider talk to (docs/architecture.md,
// "AI providers"). Authenticates the per-run token only; whatever x-api-key a repo's settings
// added is ignored and never forwarded.
import { gateway } from "@agent-office/domain/services";
import { readBoundedText } from "./api-helpers";
import { proxyAnthropic } from "./gateway-passthrough";
import { proxyChat } from "./gateway-chat";
import { gatewayError } from "./gateway-errors";
import type { GatewayOptions } from "./gateway-fetch";

/** The CLI sends whole conversations, images included; the cap only stops a runaway client. */
const MAX_GATEWAY_BODY_BYTES = 32 * 1024 * 1024;

export async function handleGatewayMessages(request: Request, opts: GatewayOptions = {}): Promise<Response> {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  const owner = token ? gateway.lookupGatewayToken(token) : null;
  if (!owner) return gatewayError(401, "authentication_error", "invalid gateway token");
  const { text, error } = await readBoundedText(request, opts.maxBodyBytes ?? MAX_GATEWAY_BODY_BYTES);
  if (error) return gatewayError(413, "request_too_large", "request too large");
  if (owner.provider === "anthropic_api") return proxyAnthropic(request, text, owner.ownerId, opts);
  if (owner.provider === "subscription") return gatewayError(401, "authentication_error", "invalid gateway token");
  return proxyChat(request, text, { ownerId: owner.ownerId, provider: owner.provider }, opts);
}
