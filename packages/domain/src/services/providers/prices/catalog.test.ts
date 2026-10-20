/**
 * The catalog with an injected fetch (no network): fetch hygiene, the LiteLLM → OpenRouter fallback,
 * the sanity merge, the atomic cache, the refresh rate limit, offline first start and the off switch.
 *
 *   pnpm --filter @agent-office/domain test src/services/providers/prices/catalog.test.ts
 */
import assert from "node:assert";
import { beforeEach, test } from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sandbox = mkdtempSync(join(tmpdir(), "ao-price-catalog-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;

const catalog = await import("./catalog");
const { LITELLM_URL, OPENROUTER_URL, MAX_CATALOG_BYTES } = await import("./fetch");
const { PRICE_CATALOG_FILE } = await import("../../infra/paths");
const { setUiSetting } = await import("../../db/ui-settings");

const fixture = (name: string): string => readFileSync(new URL(`./${name}.fixture.json`, import.meta.url), "utf8");
const DAY = 24 * 60 * 60_000;

interface Call { url: string; init: RequestInit | undefined }
let calls: Call[] = [];
const fakeFetch = (replies: Record<string, () => Response>): typeof fetch => (async (input: string | URL | Request, init?: RequestInit) => {
  calls.push({ url: String(input), init });
  const reply = replies[String(input)];
  if (!reply) throw new TypeError("fetch failed");
  return reply();
}) as typeof fetch;
const ok = (body: string) => () => new Response(body);
const litellmOnly = fakeFetch({ [LITELLM_URL]: ok(fixture("litellm")) });

beforeEach(() => {
  calls = [];
  rmSync(PRICE_CATALOG_FILE, { force: true });
  setUiSetting(catalog.PRICE_FETCH_ENABLED_KEY, "true");
  catalog.forgetPriceCatalog();
});

test("offline first start: no cache and no network is an honest empty catalog, never a throw", async () => {
  assert.deepStrictEqual(catalog.pricesView(), { source: null, fetchedAt: null, stale: false, fetchEnabled: true, entries: {} });
  assert.equal(catalog.priceFor("gpt-5"), null);
  assert.deepStrictEqual(await catalog.refreshPrices(fakeFetch({})), { ok: false, error: "price_fetch_failed" });
  assert.deepStrictEqual(calls.map((c) => c.url), [LITELLM_URL, OPENROUTER_URL]);
  assert.equal(existsSync(PRICE_CATALOG_FILE), false);
});

test("every fetch goes to a fixed URL with no redirects and a timeout; the result is cached on disk", async () => {
  const result = await catalog.refreshPrices(litellmOnly, 1_000);
  assert.equal(result.ok, true);
  assert.deepStrictEqual(calls.map((c) => [c.url, c.init?.redirect, c.init?.signal instanceof AbortSignal]), [[LITELLM_URL, "error", true]]);
  assert.equal(catalog.priceFor("gpt-5")?.inputPerMTok, 1.25);
  const disk = JSON.parse(readFileSync(PRICE_CATALOG_FILE, "utf8"));
  assert.deepStrictEqual([disk.source, disk.fetchedAt, disk.entries["gpt-5"].outputPerMTok], ["litellm", 1_000, 10]);
});

test("LiteLLM failing (status, oversize, not JSON, empty) falls back to OpenRouter", async () => {
  const bad = [() => new Response("x", { status: 503 }), () => new Response("x".repeat(MAX_CATALOG_BYTES + 1)), ok("<html>"), ok("{}")];
  for (const [i, reply] of bad.entries()) {
    catalog.forgetPriceCatalog();
    const result = await catalog.refreshPrices(fakeFetch({ [LITELLM_URL]: reply, [OPENROUTER_URL]: ok(fixture("openrouter")) }), i * 100_000);
    assert.ok(result.ok && result.view.source === "openrouter", `case ${i}`);
  }
});

test("a price more than 100x off is rejected and keeps its last good value; new junk stays unknown", async () => {
  await catalog.refreshPrices(litellmOnly, 1_000);
  const raw = JSON.parse(fixture("litellm"));
  raw["gpt-5"].input_cost_per_token *= 1000;
  raw["gpt-4o"].input_cost_per_token *= 2;
  raw["gpt-new"] = { litellm_provider: "openai", mode: "chat", input_cost_per_token: 0, output_cost_per_token: 1e-6 };
  delete raw["o3"];
  catalog.forgetPriceCatalog();
  await catalog.refreshPrices(fakeFetch({ [LITELLM_URL]: ok(JSON.stringify(raw)) }), 2 * DAY);
  assert.equal(catalog.priceFor("gpt-5")?.inputPerMTok, 1.25);
  assert.equal(catalog.priceFor("gpt-4o")?.inputPerMTok, 5);
  assert.equal(catalog.priceFor("gpt-new"), null);
  assert.ok(catalog.priceFor("o3"), "a model the new file lacks keeps its last price");
  raw["gpt-5-mini"] = { ...raw["gpt-5-mini"], output_cost_per_new_surcharge: 1e-6 };
  catalog.forgetPriceCatalog();
  await catalog.refreshPrices(fakeFetch({ [LITELLM_URL]: ok(JSON.stringify(raw)) }), 3 * DAY);
  assert.equal(catalog.priceFor("gpt-5-mini"), null, "a field it cannot price drops the old price: unknown, not cheaper");
});

test("a model id named like an object member is never a price", async () => {
  await catalog.refreshPrices(litellmOnly, 1_000);
  for (const id of ["constructor", "__proto__", "toString", "hasOwnProperty"]) assert.equal(catalog.priceFor(id), null, id);
  writeFileSync(PRICE_CATALOG_FILE, '{"source":"litellm","fetchedAt":5,"entries":{"__proto__":{"provider":"openai","inputPerMTok":1,"outputPerMTok":2}}}');
  catalog.forgetPriceCatalog();
  assert.equal(catalog.priceFor("__proto__")?.inputPerMTok, 1, "an own key is read as data");
  assert.equal(catalog.priceFor("constructor"), null);
});

test("a corrupt or hand-edited cache file is no cache", () => {
  for (const body of ["{ nope", JSON.stringify({ source: "evil", fetchedAt: 1, entries: {} }), JSON.stringify([1])]) {
    writeFileSync(PRICE_CATALOG_FILE, body);
    catalog.forgetPriceCatalog();
    assert.equal(catalog.pricesView().source, null, body);
  }
  writeFileSync(PRICE_CATALOG_FILE, JSON.stringify({
    source: "litellm", fetchedAt: 5, entries: { good: { provider: "openai", inputPerMTok: 1, outputPerMTok: 2 }, bad: { provider: "openai", inputPerMTok: -1, outputPerMTok: 2 } },
  }));
  catalog.forgetPriceCatalog();
  assert.deepStrictEqual(Object.keys(catalog.pricesView(6).entries), ["good"]);
});

test("refresh: one upstream attempt per minute however often it is called", async () => {
  await catalog.refreshPrices(litellmOnly, 10_000);
  assert.deepStrictEqual(await catalog.refreshPrices(litellmOnly, 10_000 + catalog.REFRESH_MIN_INTERVAL_MS - 1), { ok: false, error: "rate_limited" });
  assert.equal(calls.length, 1);
  const concurrent = await Promise.all([catalog.refreshPrices(litellmOnly, 200_000), catalog.refreshPrices(litellmOnly, 200_000)]);
  assert.deepStrictEqual(concurrent.map((r) => r.ok), [true, true]);
  assert.equal(calls.length, 2);
});

test("the boot check fetches only when the cache is a day old, and a cache over a week old is stale", async () => {
  await catalog.refreshPricesIfDue(litellmOnly, 0 + 2 * DAY);
  assert.equal(calls.length, 1);
  await catalog.refreshPricesIfDue(litellmOnly, 2 * DAY + DAY - 1);
  assert.equal(calls.length, 1);
  assert.equal(catalog.pricesView(2 * DAY + 7 * DAY).stale, false);
  assert.equal(catalog.pricesView(2 * DAY + 7 * DAY + 1).stale, true);
});

test("off switch: no fetch at all, every price unknown, refresh refused", async () => {
  await catalog.refreshPrices(litellmOnly, 1_000);
  calls = [];
  const view = catalog.setPriceFetchEnabled(false);
  assert.deepStrictEqual(view, { source: null, fetchedAt: null, stale: false, fetchEnabled: false, entries: {} });
  assert.equal(catalog.priceFor("gpt-5"), null);
  assert.equal(catalog.priceTableDate(), undefined);
  assert.deepStrictEqual(await catalog.refreshPrices(litellmOnly, 10 * DAY), { ok: false, error: "price_fetch_disabled" });
  await catalog.refreshPricesIfDue(litellmOnly, 10 * DAY);
  assert.equal(calls.length, 0);
  setUiSetting(catalog.PRICE_FETCH_ENABLED_KEY, "true");
  assert.equal(catalog.priceFor("gpt-5")?.inputPerMTok, 1.25, "the cache is kept for when it is turned back on");
});
