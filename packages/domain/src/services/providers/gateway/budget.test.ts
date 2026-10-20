/**
 * The openai budget math: real usage at the catalog price (cached and reasoning tokens counted), the
 * worst case when no usage came back, and the refusal once the cap is reached or the price is lost.
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

const { budgetRefusal, chargeResponse, usageCostUsd } = await import("./budget");
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

test("charges add up per run; no usage is charged the worst case; an unpriced model marks the run", () => {
  issueGatewayToken("b1", "openai", 1);
  chargeResponse("b1", "gpt-5", { input_tokens: 800, output_tokens: 500, cache_read_input_tokens: 200 }, { requestBytes: 0, maxTokens: 0 });
  chargeResponse("b1", "gpt-5", null, { requestBytes: 4000, maxTokens: 1000 });
  assert.equal(gatewaySpend("b1")?.spentUsd, EXPECTED + (4000 * 1.25 + 1000 * 10) / 1e6);
  assert.equal(budgetRefusal("b1"), null);
  chargeResponse("b1", "gpt-mystery", null, { requestBytes: 1, maxTokens: 1 });
  assert.match(budgetRefusal("b1") ?? "", /price became unknown/);
});

test("a capped run is refused once its spend reaches the cap; an uncapped one never is", () => {
  issueGatewayToken("b2", "openai", 0.01);
  chargeResponse("b2", "gpt-5", { input_tokens: 0, output_tokens: 999 }, { requestBytes: 0, maxTokens: 0 });
  assert.equal(budgetRefusal("b2"), null);
  chargeResponse("b2", "gpt-5", { input_tokens: 0, output_tokens: 1 }, { requestBytes: 0, maxTokens: 0 });
  assert.match(budgetRefusal("b2") ?? "", /^budget_exceeded: spent \$0\.0100 of \$0\.01$/);
  issueGatewayToken("b3", "openai");
  chargeResponse("b3", "gpt-5", { input_tokens: 1e9, output_tokens: 1e9 }, { requestBytes: 0, maxTokens: 0 });
  assert.equal(budgetRefusal("b3"), null);
});
