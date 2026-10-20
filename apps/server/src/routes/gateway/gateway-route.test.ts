/**
 * The gateway route with fetch stubbed: only the run token authenticates, foreign credentials are
 * never forwarded, a rejected key is reported and never echoed, and openai streams translate.
 *
 *   pnpm --filter @agent-office/server test src/routes/gateway/gateway-route.test.ts
 */
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const home = mkdtempSync(join(tmpdir(), "gateway-route-"));
process.env.HOME = home;
process.env.USERPROFILE = home;

const { POST } = await import("./v1/messages/route");
const countTokens = await import("./v1/messages/count_tokens/route");
const { gateway, providers } = await import("@agent-office/domain/services");
const tokens = await import("@agent-office/domain/services/providers/gateway-tokens");

const KEY = "sk-ant-api03-SENTINEL-real-key-000";
interface Sent { url: string; init: RequestInit }
let sent: Sent[] = [];
let reply: (url: string) => Response = () => new Response("{}");
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  sent.push({ url: String(input), init: init ?? {} });
  return reply(String(input));
}) as typeof fetch;

const failures: Array<[string, string, string | undefined]> = [];
gateway.onGatewayFailure((owner, code, detail) => void failures.push([owner, code, detail]));

const messages = (token: string, body: unknown, extra: Record<string, string> = {}) =>
  POST(new Request("http://127.0.0.1/api/gateway/v1/messages?beta=true", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "anthropic-version": "2023-06-01", ...extra },
    body: JSON.stringify(body),
  }));
const minimal = (model: string, stream = false) => ({ model, max_tokens: 50, stream, messages: [{ role: "user", content: "hi" }] });

const lastFailure = () => failures.at(-1)!;
const err400 = (message: string) => Response.json({ error: { message } }, { status: 400 });

test("no token, a never-issued token or a revoked one: 401, and nothing goes upstream", async () => {
  sent = [];
  const none = await POST(new Request("http://127.0.0.1/", { method: "POST", body: "{}" }));
  assert.equal(none.status, 401);
  assert.equal((await messages("never-issued", minimal("x"))).status, 401);
  const t = tokens.issueGatewayToken("run-revoked", "openai");
  tokens.revokeGatewayTokens("run-revoked");
  assert.equal((await messages(t, minimal("x"))).status, 401);
  assert.equal(sent.length, 0);
});

test("anthropic_api passthrough: allowlisted headers plus the stored key only; foreign credentials dropped", async () => {
  providers.saveConfig("anthropic_api", { apiKey: KEY });
  const t = tokens.issueGatewayToken("run-pass", "anthropic_api");
  sent = [];
  reply = () => new Response("event: message_stop\ndata: {}\n\n", {
    headers: { "content-type": "text/event-stream", "content-encoding": "gzip", "anthropic-ratelimit-requests-remaining": "9", "set-cookie": "x=1" },
  });
  const res = await messages(t, minimal("claude-sonnet-x", true), { "x-api-key": "sk-ant-from-repo-helper", cookie: "c=1", "anthropic-beta": "b1" });
  const out = new Headers(sent[0]!.init.headers);
  assert.equal(sent[0]!.url, "https://api.anthropic.com/v1/messages?beta=true");
  assert.equal(sent[0]!.init.redirect, "error");
  assert.equal(out.get("x-api-key"), KEY);
  assert.deepStrictEqual([out.get("authorization"), out.get("cookie"), out.get("anthropic-beta")], [null, null, "b1"]);
  assert.equal(res.headers.get("content-encoding"), null);
  assert.equal(res.headers.get("set-cookie"), null);
  assert.equal(res.headers.get("anthropic-ratelimit-requests-remaining"), "9");
});

test("a rejected key: the child gets fixed text, the run gets a scrubbed failure", async () => {
  const t = tokens.issueGatewayToken("run-401", "anthropic_api");
  reply = () => Response.json({ error: { message: "invalid x-api-key sk-ant-api03-ECHOED-KEY-123456" } }, { status: 401 });
  const res = await messages(t, minimal("claude-sonnet-x"));
  const text = await res.text();
  assert.equal(res.status, 401);
  assert.ok(text.includes(gateway.UPSTREAM_REJECTED_CREDENTIAL) && !text.includes("ECHOED"));
  const [owner, code, detail] = failures.at(-1)!;
  assert.deepStrictEqual([owner, code], ["run-401", "provider_auth_failed"]);
  assert.ok(detail && !detail.includes("ECHOED"));
});

test("openai: the streamed completion comes back as Anthropic events", async () => {
  providers.saveConfig("openai", { apiKey: "sk-proj-openai-key-0000000000", models: { haiku: "s", sonnet: "m", opus: "b" } });
  const t = tokens.issueGatewayToken("run-oa", "openai");
  sent = [];
  reply = () => new Response(
    'data: {"choices":[{"delta":{"content":"hel"}}]}\n\ndata: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n'
      + 'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\ndata: [DONE]\n\n',
    { headers: { "content-type": "text/event-stream" } },
  );
  const body = await (await messages(t, minimal("m", true), { "x-api-key": "sk-ant-repo" })).text();
  assert.equal(sent[0]!.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(new Headers(sent[0]!.init.headers).get("authorization"), "Bearer sk-proj-openai-key-0000000000");
  assert.ok(body.includes('"text":"hel"') && body.includes('"text":"lo"') && body.includes("message_stop"));
  assert.ok(body.includes('"stop_reason":"end_turn"'));
});

test("openai: an unmapped model is refused and reported; nothing goes upstream", async () => {
  const t = tokens.issueGatewayToken("run-model", "openai");
  sent = [];
  const res = await messages(t, minimal("claude-opus-5-5"));
  assert.equal(res.status, 404);
  assert.equal(sent.length, 0);
  assert.deepStrictEqual(failures.at(-1)!.slice(0, 2), ["run-model", "provider_model_not_found"]);
});

test("count_tokens is an honest 404", async () => {
  assert.equal((await countTokens.POST()).status, 404);
});

test("a local server's key echoed in an error is redacted, whatever its shape", async () => {
  providers.saveConfig("local", { baseUrl: "http://localhost:11434/v1", apiKey: "my-local-secret", models: { haiku: "q", sonnet: "q", opus: "q" } });
  const t = tokens.issueGatewayToken("run-local", "local");
  reply = () => err400("bad request for key my-local-secret");
  assert.equal((await messages(t, minimal("q"))).status, 400);
  assert.ok(!lastFailure()[2]?.includes("my-local-secret"), lastFailure()[2]);
});

test("Stop or a closed client reports no provider failure", async () => {
  const t = tokens.issueGatewayToken("run-stop", "openai");
  const before = failures.length;
  const abort = new AbortController();
  abort.abort();
  reply = () => { throw new DOMException("aborted", "AbortError"); };
  const res = await POST(new Request("http://127.0.0.1/api/gateway/v1/messages", {
    method: "POST", headers: { authorization: `Bearer ${t}` }, body: JSON.stringify(minimal("m")), signal: abort.signal,
  }));
  assert.equal(res.status, 502);
  assert.equal(failures.length, before);
});

test("an error inside the stream, or a stream that just stops, ends as an error event and a failure", async () => {
  const t = tokens.issueGatewayToken("run-midstream", "openai");
  reply = () => new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\ndata: {"error":{"message":"Rate limit reached"}}\n\n');
  const body = await (await messages(t, minimal("m", true))).text();
  assert.ok(body.includes("event: error") && !body.includes("message_stop"));
  assert.deepStrictEqual(lastFailure().slice(0, 2), ["run-midstream", "unknown"]);
  reply = () => new Response('data: {"choices":[{"delta":{"content":"cut off"}}]}\n\n');
  const dropped = await (await messages(t, minimal("m", true))).text();
  assert.ok(dropped.includes("stream_incomplete") && !dropped.includes("end_turn"));
  assert.deepStrictEqual(lastFailure().slice(1), ["provider_unreachable", "stream_incomplete"]);
});

test("anthropic_api: a spent credit balance is reported for the Settings card, and still reaches the CLI", async () => {
  const t = tokens.issueGatewayToken("run-credit", "anthropic_api");
  reply = () => err400("Your credit balance is too low to access the Anthropic API.");
  assert.equal((await messages(t, minimal("claude-x"))).status, 400);
  assert.deepStrictEqual(lastFailure(), ["run-credit", "provider_unavailable", "key_invalid"]);
});
