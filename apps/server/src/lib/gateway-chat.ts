// openai and local: Anthropic Messages in, Chat Completions upstream, Anthropic Messages (or its
// SSE stream) back to the CLI. Every upstream failure ends the run with its reason; the CLI never
// gets a status it would retry ten times for nothing.
import { gateway } from "@agent-office/domain/services";
import { gatewayError } from "./gateway-errors";
import { fetchUpstream, type FetchFailure, type GatewayOptions } from "./gateway-fetch";

type ChatProvider = "openai" | "local";
interface Call {
  ownerId: string; provider: ChatProvider; url: string; key?: string; req: gateway.AnthropicRequest;
  signal: AbortSignal; opts: GatewayOptions;
  /** alias → original tool name, for names the request had to alias. */
  names: Map<string, string>;
  /** The worst case a response without usage is charged at. */
  bound: { requestBytes: number; maxTokens: number };
}

const secretsOf = (call: Call): string[] => (call.key ? [call.key] : []);
/** A local server is free; only openai spends. */
const charge = (call: Call, usage: gateway.MessageUsage | null): void =>
  void (call.provider === "openai" && gateway.chargeResponse(call.ownerId, call.req.model, usage, call.bound));
const report = (call: Call, code: Parameters<typeof gateway.reportGatewayFailure>[1], detail: string): void =>
  gateway.reportGatewayFailure(call.ownerId, code, detail, secretsOf(call));

function post(call: Call, param: gateway.CapParam, maxTokens: number): Promise<Response | FetchFailure> {
  return fetchUpstream(call.url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(call.key ? { authorization: `Bearer ${call.key}` } : {}) },
    body: JSON.stringify(gateway.toChatRequest(call.req, call.req.model, param, { provider: call.provider, maxTokens })),
  }, call.signal, call.opts);
}

function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * At most three upstream calls per request: the first, one name swap, one clamp, each only on the
 * upstream's own 400 about the cap. What worked is remembered per model; a guess that failed is not.
 */
async function send(call: Call): Promise<Response | FetchFailure> {
  const { provider, req } = call;
  let param = gateway.capParamFor(provider, req.model);
  let tokens = gateway.capTokensFor(provider, req.model, req.max_tokens);
  const used = { swap: false, clamp: false };
  let res = await post(call, param, tokens);
  while (typeof res !== "string" && res.status === 400) {
    const retry = gateway.capRetry(param, tokens, jsonOf((await gateway.readCapped(res.clone())).text));
    const kind = retry?.maxTokens !== undefined ? "clamp" : "swap";
    if (!retry || used[kind]) return res;
    used[kind] = true;
    // The clone was read; release the original's socket before the retry.
    await res.body?.cancel().catch(() => {});
    param = retry.param;
    tokens = retry.maxTokens ?? tokens;
    res = await post(call, param, tokens);
  }
  call.bound.maxTokens = tokens;
  const ok = typeof res !== "string" && res.ok;
  if (ok && used.swap) gateway.rememberCapParam(provider, req.model, param);
  if (ok && used.clamp) gateway.rememberCapLimit(provider, req.model, tokens);
  return res;
}

async function failure(call: Call, upstream: Response): Promise<Response> {
  const text = (await gateway.readCapped(upstream)).text;
  const { status } = upstream;
  if (status === 401 || status === 403) {
    report(call, "provider_auth_failed", text);
    return gatewayError(401, "authentication_error", gateway.UPSTREAM_REJECTED_CREDENTIAL);
  }
  if (status === 404) {
    report(call, "provider_model_not_found", text);
    return gatewayError(404, "not_found_error", "model not found upstream");
  }
  if (status === 429) {
    return gatewayError(429, "rate_limit_error", "rate limited upstream", { "retry-after": upstream.headers.get("retry-after") ?? "1" });
  }
  if (status >= 500) return gatewayError(status, "api_error", `upstream ${status}`);
  report(call, "unknown", `upstream ${status}: ${gateway.upstreamMessage(jsonOf(text)) || text}`);
  return gatewayError(400, "invalid_request_error", "upstream rejected the request");
}

const STREAM_END_CODE = { empty_response: "provider_unavailable", stream_incomplete: "provider_unreachable", truncated_tool_call: "unknown" } as const;
const errorFrame = (message: string): string => gateway.sse("error", { error: { type: "api_error", message } });

function translateStream(call: Call, upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const writer = new gateway.AnthropicStreamWriter(call.req.model, call.names);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffered = "";
  let sawDone = false;
  let failed = false;
  const line = (text: string, out: TransformStreamDefaultController<Uint8Array>): void => {
    const data = text.startsWith("data:") ? text.slice(5).trim() : "";
    if (failed || !data) return;
    if (data === "[DONE]") return void (sawDone = true);
    const raw = jsonOf(data);
    const inBand = gateway.inBandError(raw);
    if (inBand) {
      failed = true;
      report(call, "unknown", `upstream stream error: ${inBand}`);
      return out.enqueue(encoder.encode(errorFrame("upstream stream error")));
    }
    const chunk = gateway.parseChatChunk(raw);
    if (chunk) for (const frame of writer.push(chunk)) out.enqueue(encoder.encode(frame));
  };
  return upstream.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(bytes, out) {
      buffered += decoder.decode(bytes, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const l of lines) line(l, out);
    },
    flush(out) {
      if (buffered) line(buffered, out);
      charge(call, writer.billedUsage());
      if (failed) return;
      const end = writer.end(sawDone);
      if (end.ok) return end.frames.forEach((f) => out.enqueue(encoder.encode(f)));
      report(call, STREAM_END_CODE[end.reason], end.reason);
      out.enqueue(encoder.encode(errorFrame(end.reason)));
    },
  }));
}

async function complete(call: Call, upstream: Response): Promise<Response> {
  const raw = jsonOf((await gateway.readCapped(upstream)).text);
  const inBand = gateway.inBandError(raw);
  if (inBand) {
    report(call, "unknown", `upstream error: ${inBand}`);
    return gatewayError(400, "invalid_request_error", "upstream rejected the request");
  }
  const message = gateway.fromChatCompletion(raw, call.req.model, call.names);
  charge(call, gateway.completionUsage(raw));
  if (message) return Response.json(message);
  report(call, "provider_unavailable", "empty_response");
  return gatewayError(400, "invalid_request_error", "empty_response");
}

export async function proxyChat(
  request: Request, body: string, owner: { ownerId: string; provider: ChatProvider }, opts: GatewayOptions = {},
): Promise<Response> {
  const parsed = gateway.anthropicRequestSchema.safeParse(jsonOf(body));
  if (!parsed.success) return gatewayError(400, "invalid_request_error", "not a Messages request");
  const target = gateway.chatTarget(owner.provider, parsed.data.model);
  if (!target.ok) {
    gateway.reportGatewayFailure(owner.ownerId, target.code, target.detail);
    return gatewayError(target.status, target.type, target.detail);
  }
  const refusal = owner.provider === "openai" ? gateway.budgetRefusal(owner.ownerId) : null;
  if (refusal) {
    gateway.reportGatewayFailure(owner.ownerId, "unknown", refusal);
    return gatewayError(400, "invalid_request_error", refusal);
  }
  const names = gateway.reverseAliases(gateway.toolAliases(parsed.data));
  const bound = { requestBytes: Buffer.byteLength(body), maxTokens: parsed.data.max_tokens };
  const call: Call = { ...owner, url: target.url, key: target.key, req: parsed.data, signal: request.signal, opts, names, bound };
  const upstream = await send(call);
  if (typeof upstream === "string") {
    // Stop and a closed client abort the fetch too: that is not the provider failing.
    if (upstream !== "aborted") report(call, "provider_unreachable", upstream);
    return gatewayError(502, "api_error", "upstream unreachable");
  }
  if (!upstream.ok) return failure(call, upstream);
  if (call.req.stream && upstream.body) {
    return new Response(translateStream(call, upstream.body), { headers: { "content-type": "text/event-stream" } });
  }
  return complete(call, upstream);
}
