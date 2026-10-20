// openai and local: Anthropic Messages in, Chat Completions upstream, Anthropic Messages (or its
// SSE stream) back to the CLI.
import { gateway } from "@agent-office/domain/services";
import { gatewayError } from "./gateway-errors";

type ChatProvider = "openai" | "local";
interface Owner { ownerId: string; provider: ChatProvider }

function callChat(url: string, key: string | undefined, body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
    redirect: "error",
    signal,
  });
}

/** Turns upstream SSE `data:` lines into Anthropic events; an empty completion becomes an error event. */
function translateStream(upstream: ReadableStream<Uint8Array>, model: string): ReadableStream<Uint8Array> {
  const writer = new gateway.AnthropicStreamWriter(model);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffered = "";
  const lineOut = (line: string, out: TransformStreamDefaultController<Uint8Array>): void => {
    const data = line.startsWith("data:") ? line.slice(5).trim() : "";
    if (!data || data === "[DONE]") return;
    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      return;
    }
    const chunk = gateway.parseChatChunk(raw);
    if (chunk) for (const frame of writer.push(chunk)) out.enqueue(encoder.encode(frame));
  };
  return upstream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(bytes, out) {
      buffered += decoder.decode(bytes, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) lineOut(line, out);
    },
    flush(out) {
      if (buffered) lineOut(buffered, out);
      const frames = writer.end() ?? [gateway.sse("error", { error: { type: "api_error", message: "empty_response" } })];
      for (const frame of frames) out.enqueue(encoder.encode(frame));
    },
  }));
}

async function failure(owner: Owner, upstream: Response): Promise<Response> {
  const text = await upstream.text().catch(() => "");
  if (upstream.status === 401 || upstream.status === 403) {
    gateway.reportGatewayFailure(owner.ownerId, "provider_auth_failed", text);
    return gatewayError(401, "authentication_error", gateway.UPSTREAM_REJECTED_CREDENTIAL);
  }
  if (upstream.status === 404) {
    gateway.reportGatewayFailure(owner.ownerId, "provider_model_not_found", text);
    return gatewayError(404, "not_found_error", "model not found upstream");
  }
  if (upstream.status === 429) {
    return gatewayError(429, "rate_limit_error", "rate limited upstream", { "retry-after": upstream.headers.get("retry-after") ?? "1" });
  }
  return gatewayError(upstream.status >= 500 ? upstream.status : 500, "api_error", `upstream ${upstream.status}`);
}

async function send(owner: Owner, url: string, key: string | undefined, req: gateway.AnthropicRequest, signal: AbortSignal): Promise<Response> {
  const sent = gateway.capParamFor(owner.provider, req.model);
  const first = await callChat(url, key, gateway.toChatRequest(req, req.model, sent), signal);
  if (first.status !== 400) return first;
  const errorBody: unknown = await first.clone().json().catch(() => null);
  const swap = gateway.swappedCapParam(owner.provider, req.model, sent, errorBody);
  return swap ? callChat(url, key, gateway.toChatRequest(req, req.model, swap), signal) : first;
}

export async function proxyChat(request: Request, body: string, owner: Owner): Promise<Response> {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return gatewayError(400, "invalid_request_error", "body is not JSON");
  }
  const parsed = gateway.anthropicRequestSchema.safeParse(raw);
  if (!parsed.success) return gatewayError(400, "invalid_request_error", "not a Messages request");
  const req = parsed.data;
  const target = gateway.chatTarget(owner.provider, req.model);
  if (!target.ok) {
    gateway.reportGatewayFailure(owner.ownerId, target.code, target.detail);
    return gatewayError(target.status, target.type, target.detail);
  }
  let upstream: Response;
  try {
    upstream = await send(owner, target.url, target.key, req, request.signal);
  } catch {
    gateway.reportGatewayFailure(owner.ownerId, "provider_unreachable", "connection_failed");
    return gatewayError(502, "api_error", "upstream unreachable");
  }
  if (!upstream.ok) return failure(owner, upstream);
  if (req.stream && upstream.body) {
    return new Response(translateStream(upstream.body, req.model), { headers: { "content-type": "text/event-stream" } });
  }
  const message = gateway.fromChatCompletion(await upstream.json().catch(() => null), req.model);
  return message ? Response.json(message) : gatewayError(500, "api_error", "empty_response");
}
