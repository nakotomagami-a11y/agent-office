// anthropic_api: the request goes byte-for-byte to the fixed official URL with the stored key
// injected; only an allowlist of headers crosses in either direction.
import { gateway } from "@agent-office/domain/services";
import { gatewayError } from "./gateway-errors";
import { readCapped } from "./gateway-read";

/** Anthropic answers a spent balance with a 400; the user must see the Settings card, not ten retries. */
const BILLING_RE = /credit balance|billing|insufficient (?:funds|credit)/i;

const REQUEST_HEADERS = ["content-type", "accept", "anthropic-version", "anthropic-beta", "user-agent"];
/** fetch already decoded the body, so content-encoding and content-length must not pass back. */
const RESPONSE_HEADER = /^(content-type|request-id|retry-after|anthropic-ratelimit-.+)$/i;

export function upstreamHeaders(upstream: Response): Headers {
  const out = new Headers();
  upstream.headers.forEach((value, name) => {
    if (RESPONSE_HEADER.test(name)) out.set(name, value);
  });
  return out;
}

export async function proxyAnthropic(request: Request, body: string, ownerId: string): Promise<Response> {
  const target = gateway.passthroughTarget();
  if (!target.ok) {
    gateway.reportGatewayFailure(ownerId, target.code, target.detail);
    return gatewayError(target.status, target.type, gateway.UPSTREAM_REJECTED_CREDENTIAL);
  }
  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-api-key", target.key ?? "");
  let upstream: Response;
  try {
    upstream = await fetch(`${target.url}${new URL(request.url).search}`, {
      method: "POST", headers, body, redirect: "error", signal: request.signal,
    });
  } catch {
    if (!request.signal.aborted) gateway.reportGatewayFailure(ownerId, "provider_unreachable", "anthropic_unreachable");
    return gatewayError(502, "api_error", "upstream unreachable");
  }
  const secrets = target.key ? [target.key] : [];
  if (upstream.status === 401 || upstream.status === 403) {
    gateway.reportGatewayFailure(ownerId, "provider_auth_failed", await readCapped(upstream), secrets);
    return gatewayError(401, "authentication_error", gateway.UPSTREAM_REJECTED_CREDENTIAL);
  }
  if (upstream.status === 400 && BILLING_RE.test(await readCapped(upstream.clone()))) {
    gateway.reportGatewayFailure(ownerId, "provider_unavailable", "key_invalid", secrets);
  }
  return new Response(upstream.body, { status: upstream.status, headers: upstreamHeaders(upstream) });
}
