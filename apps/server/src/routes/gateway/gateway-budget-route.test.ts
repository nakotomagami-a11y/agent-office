/**
 * The openai cap at the gateway, fetch stubbed: each response is charged from its usage at the
 * catalog price, and once the cap is spent the next request is an Anthropic-shaped 400 that never
 * reaches the upstream, and the run is ended with the reason.
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

let upstreamCalls = 0;
globalThis.fetch = (async () => {
  upstreamCalls++;
  return new Response(
    'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n'
      + 'data: {"choices":[],"usage":{"prompt_tokens":1000,"completion_tokens":1000}}\n\ndata: [DONE]\n\n',
    { headers: { "content-type": "text/event-stream" } },
  );
}) as typeof fetch;

const failures: Array<[string, string, string | undefined]> = [];
gateway.onGatewayFailure((owner, code, detail) => void failures.push([owner, code, detail]));

const send = async (token: string) => {
  const res = await POST(new Request("http://127.0.0.1/api/gateway/v1/messages", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-5", max_tokens: 50, stream: true, messages: [{ role: "user", content: "hi" }] }),
  }));
  return { status: res.status, body: await res.text() };
};

test("a capped openai run is charged per response and refused at its cap, before any upstream call", async () => {
  const token = tokens.issueGatewayToken("run-capped", "openai", 0.02);
  assert.equal((await send(token)).status, 200);
  assert.equal(tokens.gatewaySpend("run-capped")?.spentUsd, 0.011);
  assert.equal((await send(token)).status, 200);
  const before = upstreamCalls;
  const refused = await send(token);
  assert.equal(refused.status, 400);
  assert.match(refused.body, /"type":"invalid_request_error".*budget_exceeded/);
  assert.equal(upstreamCalls, before);
  assert.deepStrictEqual(failures.at(-1)?.slice(0, 2), ["run-capped", "unknown"]);
  assert.match(failures.at(-1)?.[2] ?? "", /^budget_exceeded: spent \$0\.0220 of \$0\.02$/);
});

test("an uncapped openai run is charged but never refused", async () => {
  const token = tokens.issueGatewayToken("run-free", "openai");
  for (let i = 0; i < 3; i++) assert.equal((await send(token)).status, 200);
  assert.equal(tokens.gatewaySpend("run-free")?.spentUsd, 0.033);
});
