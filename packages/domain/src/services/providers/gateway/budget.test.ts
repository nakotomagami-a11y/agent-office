/**
 * The openai budget math: real usage at the catalog price (cached and reasoning tokens counted), the
 * worst case when no usage came back, holds for calls in flight, and the refusal at the cap.
 *
 *   pnpm --filter @agent-office/domain test src/services/providers/gateway/budget.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const sandbox = mkdtempSync(join(tmpdir(), "ao-gateway-budget-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;

const { openCharge, usageCostUsd } = await import("./budget");
const { completionUsage } = await import("./from-chat");
const { AnthropicStreamWriter, parseChatChunk } = await import("./from-chat-stream");
const { gatewaySpend, issueGatewayToken } = await import("../gateway-tokens");
const { forgetPriceCatalog } = await import("../prices/catalog");
const { PRICE_CATALOG_FILE } = await import("../../infra/paths");

const GPT5 = { provider: "openai" as const, inputPerMTok: 1.25, outputPerMTok: 10, cacheReadPerMTok: 0.125 };
mkdirSync(dirname(PRICE_CATALOG_FILE), { recursive: true });
writeFileSync(PRICE_CATALOG_FILE, JSON.stringify({ source: "litellm", fetchedAt: Date.now(), entries: { "gpt-5": GPT5 } }));
forgetPriceCatalog();

/** 1000 prompt tokens of which 200 cached; 500 completion tokens of which 400 reasoning. */
const OPENAI_USAGE = { prompt_tokens: 1000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 200 }, completion_tokens_details: { reasoning_tokens: 400 } };
const EXPECTED = (800 * 1.25 + 200 * 0.125 + 500 * 10) / 1e6;

test("both translators report what OpenAI billed: cached split out, reasoning inside the output", () => {
  const fromCompletion = completionUsage({ choices: [{ message: { content: "x" } }], usage: OPENAI_USAGE });
  assert.deepStrictEqual(fromCompletion, { input_tokens: 800, output_tokens: 500, cache_read_input_tokens: 200 });
  assert.equal(usageCostUsd(GPT5, fromCompletion!), EXPECTED);
  const writer = new AnthropicStreamWriter("gpt-5");
  assert.equal(writer.billedUsage(), null, "no usage chunk yet");
  writer.push(parseChatChunk({ choices: [], usage: OPENAI_USAGE })!);
  assert.deepStrictEqual(writer.billedUsage(), fromCompletion);
  assert.equal(completionUsage({ choices: [{ message: { content: "x" } }] }), null);
});

const ZERO = { requestBytes: 0, maxTokens: 0 };
type Opened = ReturnType<typeof openCharge>;
const settled = (o: Opened) => {
  assert.ok("settle" in o, JSON.stringify(o));
  return o.settle;
};

test("each call settles once: real usage, or the worst case when none came; an unpriced model marks the run", () => {
  issueGatewayToken("b1", "openai", 1);
  const first = settled(openCharge("b1", "gpt-5", ZERO));
  first({ input_tokens: 800, output_tokens: 500, cache_read_input_tokens: 200 });
  first({ input_tokens: 1e9, output_tokens: 1e9 });
  settled(openCharge("b1", "gpt-5", { requestBytes: 4000, maxTokens: 1000 }))(null);
  assert.equal(gatewaySpend("b1")?.spentUsd, EXPECTED + (4000 * 1.25 + 1000 * 10) / 1e6);
  assert.equal(gatewaySpend("b1")?.reservedUsd, 0);
  assert.deepStrictEqual(openCharge("b1", "gpt-mystery", ZERO), { refusal: "budget_exceeded: the price is unknown", final: true });
  issueGatewayToken("b4", "openai");
  settled(openCharge("b4", "gpt-mystery", ZERO))(null);
  assert.equal(gatewaySpend("b4")?.unpriced, true, "uncapped: runs on, but its cost becomes unknown");
});

test("a capped run is refused once spent plus calls in flight reach the cap; the crossing call still runs", () => {
  issueGatewayToken("b2", "openai", 0.01);
  settled(openCharge("b2", "gpt-5", ZERO))({ input_tokens: 0, output_tokens: 999 });
  const crossing = settled(openCharge("b2", "gpt-5", ZERO));
  crossing({ input_tokens: 0, output_tokens: 1 });
  assert.deepStrictEqual(openCharge("b2", "gpt-5", ZERO), { refusal: "budget_exceeded: spent $0.0100 of $0.01", final: true });
  issueGatewayToken("b3", "openai");
  settled(openCharge("b3", "gpt-5", ZERO))({ input_tokens: 1e9, output_tokens: 1e9 });
  assert.ok("settle" in openCharge("b3", "gpt-5", ZERO), "uncapped: never refused");
});

test("parallel calls: holds in flight make the next call wait (not final); only real spend ends the run", () => {
  issueGatewayToken("p", "openai", 0.05);
  const a = settled(openCharge("p", "gpt-5", { requestBytes: 0, maxTokens: 5000 }));
  const refused = openCharge("p", "gpt-5", { requestBytes: 0, maxTokens: 10 });
  assert.deepStrictEqual(refused, { refusal: "budget_held: spent $0.0000, $0.0500 held by calls in flight, cap $0.05", final: false });
  a({ input_tokens: 0, output_tokens: 100 });
  assert.ok("settle" in openCharge("p", "gpt-5", ZERO), "the hold is released when the call settles");
});
