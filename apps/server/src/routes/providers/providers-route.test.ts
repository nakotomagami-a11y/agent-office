/**
 * The provider routes: no response carries key material, the settings gate refuses first-run
 * completion until a provider is chosen, and a provider that cannot run is never selected.
 *
 *   pnpm --filter @agent-office/server test src/routes/providers/providers-route.test.ts
 */
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const home = mkdtempSync(join(tmpdir(), "providers-route-"));
process.env.HOME = home;
process.env.USERPROFILE = home;

const list = await import("./route");
const selected = await import("./selected/route");
const one = await import("./[id]/route");
const key = await import("./[id]/key/route");
const settingsRoute = await import("../settings/route");

const SENTINEL = "sk-proj-SENTINEL-route-key-0000000";
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const put = (body: unknown) => new Request("http://localhost/", { method: "PUT", body: JSON.stringify(body) });

test("a fresh install cannot complete or skip the wizard before choosing a provider", async () => {
  const res = await settingsRoute.PUT(put({ projectsRoot: join(home, "root"), excluded: [] }));
  assert.equal(res.status, 400);
  assert.deepStrictEqual(await res.json(), { error: "provider_required" });
  const skip = await settingsRoute.PATCH(new Request("http://localhost/", { method: "PATCH", body: JSON.stringify({ firstRunComplete: true }) }));
  assert.deepStrictEqual([skip.status, await skip.json()], [400, { error: "provider_required" }], "checked before settings_not_initialized");
  const view = await (await list.GET()).json();
  assert.equal(view.needsSetup, true);
  assert.equal(view.selected, null);
});

test("saving a key returns only its last four characters, never the key", async () => {
  const res = await one.PUT(put({ apiKey: SENTINEL, models: { haiku: "a", sonnet: "b", opus: "c" } }), params("openai"));
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(!text.includes("SENTINEL"));
  assert.ok(text.includes('"keyHint":"0000"'));
  assert.ok(!(await (await list.GET()).text()).includes("SENTINEL"));
});

test("bad input is refused: unknown provider, subscription config, userinfo URL, unknown field", async () => {
  assert.equal((await one.PUT(put({}), params("gpt"))).status, 400);
  assert.equal((await one.PUT(put({}), params("subscription"))).status, 400);
  assert.equal((await one.PUT(put({ baseUrl: "http://u:p@h/v1" }), params("openai"))).status, 400);
  assert.equal((await one.PUT(put({ secret_base_url: "x" }), params("openai"))).status, 400);
  assert.equal((await one.PUT(put({ baseUrl: "https://x.test" }), params("anthropic_api"))).status, 400);
});

test("a provider without its key cannot be selected, even when the user accepts", async () => {
  await key.DELETE(new Request("http://localhost/", { method: "DELETE" }), params("openai"));
  const res = await selected.PUT(put({ provider: "openai", acceptUnavailable: true }));
  assert.equal(res.status, 409);
  assert.deepStrictEqual(await res.json(), { error: "provider_not_ready", reason: "key_missing" });
});

const patch = (body: unknown) => new Request("http://localhost/", { method: "PATCH", body: JSON.stringify(body) });

test("the dev-menu re-arm is never gated by the provider", async () => {
  const res = await settingsRoute.PATCH(patch({ firstRunComplete: false }));
  assert.notDeepStrictEqual(await res.json(), { error: "provider_required" });
});

test("a short local key shows as stored without a hint; DELETE and an address change both clear it", async () => {
  const models = { haiku: "q", sonnet: "q", opus: "q" };
  let view = await (await one.PUT(put({ baseUrl: "http://localhost:11434/v1", apiKey: "ollama", models }), params("local"))).json();
  let local = view.providers.find((p: { id: string }) => p.id === "local");
  assert.deepStrictEqual([local.hasKey, local.keyHint], [true, undefined]);
  view = await (await key.DELETE(new Request("http://localhost/", { method: "DELETE" }), params("local"))).json();
  assert.equal(view.providers.find((p: { id: string }) => p.id === "local").hasKey, false);
  await one.PUT(put({ apiKey: "ollama" }), params("local"));
  view = await (await one.PUT(put({ baseUrl: "http://localhost:1234/v1" }), params("local"))).json();
  local = view.providers.find((p: { id: string }) => p.id === "local");
  assert.deepStrictEqual([local.hasKey, local.config.baseUrl], [false, "http://localhost:1234/v1"]);
});

test("selecting a provider that passes its probe returns the new selection; then first run can complete", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ data: [{ id: "q" }] })) as typeof fetch;
  try {
    const res = await selected.PUT(put({ provider: "local" }));
    assert.equal(res.status, 200);
    const view = await res.json();
    assert.deepStrictEqual([view.selected, view.needsSetup], ["local", false]);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal((await settingsRoute.PUT(put({ projectsRoot: join(home, "root"), excluded: [] }))).status, 200);
  assert.equal((await settingsRoute.PATCH(patch({ firstRunComplete: true }))).status, 200);
});
