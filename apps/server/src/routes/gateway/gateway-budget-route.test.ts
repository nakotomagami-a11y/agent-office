/**
 * The openai cap at the gateway, fetch stubbed: each response is charged from its usage at the
 * catalog price (a cut stream at its worst case), and once the cap is spent the next request is an
 * Anthropic-shaped 400 that never reaches the upstream, and the run is ended as budget_exceeded.
 *
 *   pnpm --filter @agent-office/server test src/routes/gateway/gateway-budget-route.test.ts
 */
import assert from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

const home = mkdtempSync(join(tmpdir(), "gateway-budget-"));
process.env.HOME = home;
process.env.USERPROFILE = home;

const { POST } = await import("./v1/messages/route");
const { gateway, providers } = await import("@agent-office/domain/services");
const tokens = await import("@agent-office/domain/services/providers/gateway-tokens");
const { PRICE_CATALOG_FILE } = await import("@agent-office/domain/services/infra/paths");

mkdirSync(dirname(PRICE_CATALOG_FILE), { recursive: true });
writeFileSync(PRICE_CATALOG_FILE, JSON.stringify({
  source: "litellm", fetchedAt: Date.now(), entries: { "gpt-5": { provider: "openai", inputPerMTok: 1, outputPerMTok: 10 } },
}));
providers.saveConfig("openai", { apiKey: "sk-proj-budget-key-000000000000", models: { haiku: "gpt-5", sonnet: "gpt-5", opus: "gpt-5" } });

const FULL = 'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n'
  + 'data: {"choices":[],"usage":{"prompt_tokens":1000,"completion_tokens":1000}}\n\ndata: [DONE]\n\n';
const FIRST = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n');
let upstream: () => BodyInit = () => FULL;
let upstreamCalls = 0;
globalThis.fetch = (async () => {
  upstreamCalls++;
  return new Response(upstream(), { headers: { "content-type": "text/event-stream" } });
}) as typeof fetch;

const failures: Array<[string, string, string | undefined]> = [];
gateway.onGatewayFailure((owner, code, detail) => void failures.push([owner, code, detail]));

const BODY = JSON.stringify({ model: "gpt-5", max_tokens: 50, stream: true, messages: [{ role: "user", content: "hi" }] });
/** No usage came back: a token per request byte at $1/MTok plus the 50-token output cap at $10/MTok. */
const WORST = (Buffer.byteLength(BODY) + 50 * 10) / 1e6;
const request = (token: string) => POST(new Request("http://127.0.0.1/api/gateway/v1/messages", {
  method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: BODY,
}));
const send = async (token: string) => {
  const res = await request(token);
  return { status: res.status, body: await res.text() };
};
const spend = (owner: string) => [tokens.gatewaySpend(owner)?.spentUsd, tokens.gatewaySpend(owner)?.reservedUsd];

test("a capped openai run is charged per response and refused at its cap, before any upstream call", async () => {
  const token = tokens.issueGatewayToken("run-capped", "openai", 0.02);
  assert.equal((await send(token)).status, 200);
  assert.deepStrictEqual(spend("run-capped"), [0.011, 0]);
  assert.equal((await send(token)).status, 200);
  const before = upstreamCalls;
  const refused = await send(token);
  assert.equal(refused.status, 400);
  assert.match(refused.body, /"type":"invalid_request_error".*budget_exceeded/);
  assert.equal(upstreamCalls, before);
  assert.deepStrictEqual(failures.at(-1)?.slice(0, 2), ["run-capped", "budget_exceeded"]);
  assert.match(failures.at(-1)?.[2] ?? "", /^budget_exceeded: spent \$0\.0220 of \$0\.02$/);
});

test("an uncapped openai run is charged but never refused", async () => {
  const token = tokens.issueGatewayToken("run-free", "openai");
  for (let i = 0; i < 3; i++) assert.equal((await send(token)).status, 200);
  assert.equal(tokens.gatewaySpend("run-free")?.spentUsd, 0.033);
});

test("a stream cut by Stop, or by the upstream dropping, is still charged its worst case and releases its hold", async () => {
  upstream = () => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(FIRST); } });
  const stopped = tokens.issueGatewayToken("run-stop", "openai", 5);
  const reader = (await request(stopped)).body!.getReader();
  await reader.read();
  await reader.cancel();
  assert.deepStrictEqual(spend("run-stop"), [WORST, 0]);

  upstream = () => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(FIRST); setTimeout(() => c.error(new Error("socket reset")), 5); } });
  const dropped = tokens.issueGatewayToken("run-drop", "openai", 5);
  await (await request(dropped)).text().catch(() => "");
  assert.deepStrictEqual(spend("run-drop"), [WORST, 0]);
  upstream = () => FULL;
});

test("a call held only by others in flight gets a retryable 429, records no failure, and passes once they settle", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const small = 'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n'
    + 'data: {"choices":[],"usage":{"prompt_tokens":1,"completion_tokens":1}}\n\ndata: [DONE]\n\n';
  upstream = () => new ReadableStream<Uint8Array>({ async start(c) { await gate; c.enqueue(new TextEncoder().encode(small)); c.close(); } });
  const token = tokens.issueGatewayToken("run-held", "openai", WORST * 1.5);
  const before = failures.length;
  const [a, b] = await Promise.all([request(token), request(token)]);
  const held = await request(token);
  assert.equal(held.status, 429);
  assert.equal(held.headers.get("retry-after"), "2");
  assert.match(await held.text(), /"type":"rate_limit_error".*budget_held/);
  release();
  await Promise.all([a.text(), b.text()]);
  assert.deepStrictEqual(spend("run-held"), [22e-6, 0]);
  assert.equal((await send(token)).status, 200);
  assert.equal(failures.length, before, "the run was never ended");
  upstream = () => FULL;
});

test("an upstream error status is not billed and releases its hold", async () => {
  upstream = () => FULL;
  globalThis.fetch = (async () => Response.json({ error: { message: "nope" } }, { status: 500 })) as typeof fetch;
  const token = tokens.issueGatewayToken("run-500", "openai", 5);
  assert.equal((await send(token)).status, 500);
  assert.deepStrictEqual(spend("run-500"), [0, 0]);
});
