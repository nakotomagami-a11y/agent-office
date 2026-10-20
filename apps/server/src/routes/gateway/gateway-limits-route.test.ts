/**
 * The gateway's limits with fetch stubbed: the output-cap retry budget and cache, the body cap and
 * the first-byte deadline.
 *
 *   pnpm --filter @agent-office/server test src/routes/gateway/gateway-limits-route.test.ts
 */
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const home = mkdtempSync(join(tmpdir(), "gateway-limits-"));
process.env.HOME = home;
process.env.USERPROFILE = home;

const { POST } = await import("./v1/messages/route");
const { gateway, providers } = await import("@agent-office/domain/services");
const tokens = await import("@agent-office/domain/services/providers/gateway-tokens");

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
const { handleGatewayMessages } = await import("../../lib/gateway");
providers.saveConfig("openai", { apiKey: "sk-proj-openai-key-0000000000", models: { haiku: "s", sonnet: "m", opus: "b" } });

test("openai: a 400 naming the cap parameter is retried once with the other name; any other 400 is not", async () => {
  const t = tokens.issueGatewayToken("run-cap", "openai");
  sent = [];
  reply = () => (sent.length === 1
    ? Response.json({ error: { message: "Unsupported parameter: 'max_completion_tokens'" } }, { status: 400 })
    : Response.json({ choices: [{ message: { content: "ok" } }] }));
  assert.equal((await messages(t, minimal("s"))).status, 200);
  assert.equal(sent.length, 2);
  assert.ok(String(sent[1]!.init.body).includes('"max_tokens"'));
  sent = [];
  reply = () => Response.json({ error: { message: "bad tool schema" } }, { status: 400 });
  await messages(t, minimal("b"));
  assert.equal(sent.length, 1);
});

test("a cap 'too large' is clamped once; a second 400 reaches the child as a 400, never a retried 500; nothing is cached", async () => {
  const t = tokens.issueGatewayToken("run-big", "openai");
  sent = [];
  reply = () => err400("max_completion_tokens is too large: 32000. This model supports at most 16384 completion tokens.");
  const res = await messages(t, { ...minimal("b"), max_tokens: 32000 });
  assert.equal(res.status, 400);
  assert.equal(sent.length, 2);
  assert.ok(String(sent[1]!.init.body).includes('"max_completion_tokens":16384'));
  assert.deepStrictEqual(lastFailure().slice(0, 2), ["run-big", "unknown"]);
  sent = [];
  reply = () => (sent.length === 1 ? err400("max_completion_tokens is not supported with this model") : err400("still bad"));
  await messages(t, minimal("m"));
  sent = [];
  reply = () => Response.json({ choices: [{ message: { content: "ok" } }] });
  await messages(t, minimal("m"));
  assert.ok(String(sent[0]!.init.body).includes('"max_completion_tokens"'), "a failed swap is not remembered");
});

test("an oversize body is a 413 before anything goes upstream", async () => {
  const t = tokens.issueGatewayToken("run-413", "openai");
  sent = [];
  const req = new Request("http://127.0.0.1/", { method: "POST", headers: { authorization: `Bearer ${t}` }, body: JSON.stringify(minimal("m")) });
  assert.equal((await handleGatewayMessages(req, { maxBodyBytes: 10 })).status, 413);
  assert.equal(sent.length, 0);
});

test("cap retries: same URL and credential every time, never redirects, at most three calls, the clamp cached after it worked", async () => {
  const t = tokens.issueGatewayToken("run-budget", "openai");
  sent = [];
  reply = () => (sent.length === 1 ? err400("max_completion_tokens is not supported with this model, use max_tokens instead")
    : err400("max_tokens is too large: 32000. This model supports at most 8192 tokens."));
  assert.equal((await messages(t, { ...minimal("b"), max_tokens: 32000 })).status, 400);
  assert.equal(sent.length, 3, "first, one swap, one clamp, then the failure is returned");
  assert.ok(sent.every((s) => s.url === sent[0]!.url && s.init.redirect === "error"));
  assert.ok(sent.every((s) => new Headers(s.init.headers).get("authorization") === new Headers(sent[0]!.init.headers).get("authorization")));
  sent = [];
  reply = () => (sent.length === 1 ? err400("max_tokens is too large: 32000. This model supports at most 12000.") : Response.json({ choices: [{ message: { content: "ok" } }] }));
  assert.equal((await messages(t, { ...minimal("s"), max_tokens: 32000 })).status, 200);
  sent = [];
  reply = () => Response.json({ choices: [{ message: { content: "ok" } }] });
  await messages(t, { ...minimal("s"), max_tokens: 32000 });
  assert.equal(sent.length, 1);
  assert.ok(/"max_[a-z_]*tokens":12000/.test(String(sent[0]!.init.body)), "the next request pays nothing");
});

test("an upstream that never sends headers is ended as unreachable after the first-byte deadline", async () => {
  const t = tokens.issueGatewayToken("run-ttfb", "openai");
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((_u: string | URL | Request, init?: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  })) as typeof fetch;
  try {
    const req = new Request("http://127.0.0.1/", { method: "POST", headers: { authorization: `Bearer ${t}` }, body: JSON.stringify(minimal("m")) });
    assert.equal((await handleGatewayMessages(req, { firstByteTimeoutMs: 20 })).status, 502);
    assert.deepStrictEqual(lastFailure(), ["run-ttfb", "provider_unreachable", "timeout"]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

