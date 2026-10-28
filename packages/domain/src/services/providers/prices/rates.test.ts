/**
 * The context-cost estimate reads the catalog for the model that really bills under the selected
 * provider, and an unknown price is `known: false` (the UI shows "—"), never a throw or a guess.
 *
 *   pnpm --filter @agent-office/domain test src/services/providers/prices/rates.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sandbox = mkdtempSync(join(tmpdir(), "ao-price-rates-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;

const { contextCacheRates, upstreamModelId } = await import("./rates");
const { forgetPriceCatalog, PRICE_FETCH_ENABLED_KEY } = await import("./catalog");
const { PRICE_CATALOG_FILE } = await import("../../infra/paths");
const { setUiSetting } = await import("../../db/ui-settings");
const store = await import("../store");
const { buildContextCostBreakdown } = await import("../../agents/context-cost");

test("offline first start: no catalog means unknown, and the Context & Cost breakdown still builds", () => {
  store.setSelection("subscription", "chosen");
  assert.deepStrictEqual(contextCacheRates("sonnet"), { write: 0, read: 0, known: false });
  const breakdown = buildContextCostBreakdown({ agentId: "nobody", project: null });
  assert.deepStrictEqual([breakdown.priceKnown, breakdown.costPerRunEst], [false, 0]);
});

test("the billing model: Anthropic's versioned id, or the openai/local tier mapping (fable runs as opus)", () => {
  assert.equal(upstreamModelId("subscription", "sonnet"), "claude-sonnet-4-6");
  assert.equal(upstreamModelId("anthropic_api", "claude-opus-4-7"), "claude-opus-4-7");
  store.saveProviderConfig("openai", { apiKey: "sk-proj-rates-test-0000000000", models: { haiku: "gpt-5-mini", opus: "gpt-5" } });
  assert.equal(upstreamModelId("openai", "claude-fable-5"), "gpt-5");
  assert.equal(upstreamModelId("openai", "haiku"), "gpt-5-mini");
  assert.equal(upstreamModelId("openai", "sonnet"), null);
  assert.equal(upstreamModelId("openai", "mystery"), null);
});

test("priced: cache rates per token from the catalog; openai's missing cache write is plain input", () => {
  writeFileSync(PRICE_CATALOG_FILE, JSON.stringify({
    source: "litellm", fetchedAt: Date.now(), entries: {
      "claude-sonnet-4-6": { provider: "anthropic", inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.3, cacheWritePerMTok: 3.75 },
      "gpt-5": { provider: "openai", inputPerMTok: 1.25, outputPerMTok: 10, cacheReadPerMTok: 0.125 },
    },
  }));
  forgetPriceCatalog();
  assert.deepStrictEqual(contextCacheRates("sonnet"), { write: 3.75e-6, read: 3e-7, known: true });
  store.setSelection("openai", "chosen");
  assert.deepStrictEqual(contextCacheRates("opus"), { write: 1.25e-6, read: 1.25e-7, known: true });
  assert.equal(contextCacheRates("sonnet").known, false, "an unmapped tier is unknown");
  setUiSetting(PRICE_FETCH_ENABLED_KEY, "false");
  assert.equal(contextCacheRates("opus").known, false, "fetching off: every price unknown");
  setUiSetting(PRICE_FETCH_ENABLED_KEY, "true");
  store.setSelection("local", "chosen");
  assert.deepStrictEqual(contextCacheRates("opus"), { write: 0, read: 0, known: true });
});
