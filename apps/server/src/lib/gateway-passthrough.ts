// anthropic_api: the request goes byte-for-byte to the fixed official URL with the stored key
// injected; only an allowlist of headers crosses in either direction.
import { gateway } from "@agent-office/domain/services";
import { gatewayError } from "./gateway-errors";
import { fetchUpstream, type GatewayOptions } from "./gateway-fetch";

const REQUEST_HEADERS = ["content-type", "accept", "anthropic-version", "anthropic-beta", "user-agent"];
/** fetch already decoded the body, so content-encoding and content-length must not pass back. */
const RESPONSE_HEADER = /^(content-type|request-id|retry-after|anthropic-ratelimit-.+)$/i;
/** Anthropic answers a spent balance with a 400; the user must see the Settings card, not ten retries. */
const BILLING_RE = /credit balance|billing|insufficient (?:funds|credit)/i;

export function upstreamHeaders(upstream: Response): Headers {
  const out = new Headers();
  upstream.headers.forEach((value, name) => {
    if (RESPONSE_HEADER.test(name)) out.set(name, value);
  });
  return out;
}

function forwardedHeaders(request: Request, key: string): Headers {
  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-api-key", key);
  return headers;
}

export async function proxyAnthropic(request: Request, body: string, ownerId: string, opts: GatewayOptions = {}): Promise<Response> {
  const target = gateway.passthroughTarget();
  if (!target.ok) {
    gateway.reportGatewayFailure(ownerId, target.code, target.detail);
    return gatewayError(target.status, target.type, gateway.UPSTREAM_REJECTED_CREDENTIAL);
  }
  const key = target.key ?? "";
  const url = `${opts.anthropicUrl ?? target.url}${new URL(request.url).search}`;
  const upstream = await fetchUpstream(url, { method: "POST", headers: forwardedHeaders(request, key), body }, request.signal, opts);
  if (typeof upstream === "string") {
    if (upstream !== "aborted") gateway.reportGatewayFailure(ownerId, "provider_unreachable", upstream);
    return gatewayError(502, "api_error", "upstream unreachable");
  }
  if (upstream.status === 401 || upstream.status === 403) {
    gateway.reportGatewayFailure(ownerId, "provider_auth_failed", (await gateway.readCapped(upstream)).text, [key]);
    return gatewayError(401, "authentication_error", gateway.UPSTREAM_REJECTED_CREDENTIAL);
  }
  if (upstream.status === 400 && BILLING_RE.test((await gateway.readCapped(upstream.clone())).text)) {
    gateway.reportGatewayFailure(ownerId, "provider_unavailable", "key_invalid", [key]);
  }
  return new Response(upstream.body, { status: upstream.status, headers: upstreamHeaders(upstream) });
}
