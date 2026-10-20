/**
 * The price routes with fetch stubbed: the view carries only prices, source, date and the switch;
 * the switch is a strict PUT; refresh is refused when off and rate-limited when on.
 *
 *   pnpm --filter @agent-office/server test src/routes/model-prices/model-prices-route.test.ts
 */
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const home = mkdtempSync(join(tmpdir(), "model-prices-route-"));
process.env.HOME = home;
process.env.USERPROFILE = home;

const prices = await import("./route");
const refresh = await import("./refresh/route");
const settings = await import("./settings/route");

const urls: string[] = [];
globalThis.fetch = (async (input: string | URL | Request) => {
  urls.push(String(input));
  return Response.json({ "gpt-5": { litellm_provider: "openai", mode: "chat", input_cost_per_token: 1.25e-6, output_cost_per_token: 1e-5 } });
}) as typeof fetch;

const put = (body: unknown) => settings.PUT(new Request("http://127.0.0.1/api/model-prices/settings", {
  method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}));

test("a fresh install answers an empty catalog with fetching on", async () => {
  assert.deepStrictEqual(await (await prices.GET()).json(), { source: null, fetchedAt: null, stale: false, fetchEnabled: true, entries: {} });
});

test("the switch is a strict boolean PUT; off refuses refresh with 409 and fetches nothing", async () => {
  assert.equal((await put({ fetchEnabled: "no" })).status, 400);
  assert.equal((await put({ fetchEnabled: false, extra: 1 })).status, 400);
  const off = await put({ fetchEnabled: false });
  assert.equal(off.status, 200);
  assert.equal((await off.json()).fetchEnabled, false);
  const refused = await refresh.POST();
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).error, "price_fetch_disabled");
  assert.deepStrictEqual(urls, []);
});

test("on: refresh fetches once and answers the view; a second call within a minute is 429", async () => {
  await put({ fetchEnabled: true });
  const first = await refresh.POST();
  assert.equal(first.status, 200);
  const view = await first.json();
  assert.deepStrictEqual([view.source, view.fetchEnabled, view.entries["gpt-5"]], ["litellm", true, { provider: "openai", inputPerMTok: 1.25, outputPerMTok: 10 }]);
  assert.deepStrictEqual(Object.keys(view).sort(), ["entries", "fetchEnabled", "fetchedAt", "source", "stale"]);
  assert.equal((await refresh.POST()).status, 429);
  assert.equal(urls.length, 1);
});
