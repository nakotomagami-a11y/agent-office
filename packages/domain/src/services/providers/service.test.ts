/**
 * Probes are classified, never sent a stored key for a URL it was not saved for (Q-50), and a
 * selection refuses block reasons always and accept reasons unless the user accepts (G-2 B).
 *
 *   pnpm --filter @agent-office/domain test src/services/providers/service.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sandbox = mkdtempSync(join(tmpdir(), "ao-provider-service-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;
// Hermetic: the view reads the CLI health; a pinned fresh entry means no real `claude` is spawned.
globalThis.__agentOfficeHealthState = { cached: { available: true, version: "test" }, cachedAt: Date.now(), inflight: null };

const { selectProvider, testProvider, providersView } = await import("./service");
const store = await import("./store");
const { planFromSubscriptionType } = await import("./plan");
type Deps = import("./status").ProbeDeps;

const KEY = "sk-proj-SENTINEL-stored-key-000000";
const MODELS = { haiku: "m-small", sonnet: "m-mid", opus: "m-big" };

interface Call { url: string; init: RequestInit | undefined }
function deps(respond: (url: string) => Response | Error, auth: unknown = { loggedIn: true, apiProvider: "firstParty" }) {
  const calls: Call[] = [];
  const d: Deps = {
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const r = respond(url);
      if (r instanceof Error) throw r;
      return r;
    }) as typeof fetch,
    authStatus: async () => auth,
  };
  return { d, calls };
}
const models = (...ids: string[]) => Response.json({ data: ids.map((id) => ({ id })) });
const header = (c: Call, name: string) => new Headers(c.init?.headers).get(name);

test("statuses are classified, and every credentialed call refuses redirects", async () => {
  store.saveProviderConfig("openai", { apiKey: KEY, models: MODELS });
  const cases: Array<[Response | Error, string | undefined]> = [
    [models("m-small", "m-mid", "m-big"), undefined],
    [new Response("", { status: 401 }), "key_invalid"],
    [new Response("", { status: 429 }), "rate_limited"],
    [new Response("", { status: 503 }), "unreachable"],
    [models(), "no_models"],
    [models("m-small", "m-mid"), "model_not_found"],
    [Object.assign(new Error("t"), { name: "TimeoutError" }), "timeout"],
    [new TypeError("fetch failed"), "unreachable"],
  ];
  for (const [response, reason] of cases) {
    const { d, calls } = deps(() => response);
    const r = await testProvider("openai", undefined, d);
    assert.equal(r.reason, reason, String(reason));
    assert.equal(calls[0]?.init?.redirect, "error");
    assert.equal(calls[0]?.url, "https://api.openai.com/v1/models");
  }
});

test("Q-50: a draft URL other than the stored one never gets the stored key", async () => {
  const noKey = deps(() => models("x"));
  const r = await testProvider("openai", { baseUrl: "https://api.openai.com.evil.test/v1" }, noKey.d);
  assert.deepStrictEqual([r.ok, r.reason, noKey.calls.length], [false, "key_missing", 0], "refused without any call");

  const ownKey = deps(() => models("x"));
  await testProvider("openai", { baseUrl: "https://evil.test/v1", apiKey: "draft-key-1234567890" }, ownKey.d);
  assert.equal(header(ownKey.calls[0]!, "authorization"), "Bearer draft-key-1234567890");

  const same = deps(() => models("m-small", "m-mid", "m-big"));
  await testProvider("openai", { baseUrl: "HTTPS://api.openai.com/v1/" }, same.d);
  assert.equal(header(same.calls[0]!, "authorization"), `Bearer ${KEY}`, "same normalized URL: stored key");
});

test("a local server needs no key, and never receives a key saved for another URL", async () => {
  store.saveProviderConfig("local", { baseUrl: "http://localhost:11434/v1", apiKey: "local-key-1234567890", models: MODELS });
  const { d, calls } = deps(() => models("m-small", "m-mid", "m-big"));
  const r = await testProvider("local", { baseUrl: "http://localhost:1234/v1" }, d);
  assert.equal(r.ok, true);
  assert.equal(header(calls[0]!, "authorization"), null);
});

test("anthropic_api probes the fixed official URL with x-api-key", async () => {
  store.saveProviderConfig("anthropic_api", { apiKey: "sk-ant-api03-official-key-0000" });
  const { d, calls } = deps(() => models("claude-x"));
  assert.equal((await testProvider("anthropic_api", undefined, d)).ok, true);
  assert.equal(calls[0]!.url, "https://api.anthropic.com/v1/models");
  assert.equal(header(calls[0]!, "x-api-key"), "sk-ant-api03-official-key-0000");
});

test("subscription reads auth status: signed out is not_signed_in, no CLI is cli_missing", async () => {
  assert.equal((await testProvider("subscription", undefined, deps(() => models(), { loggedIn: false }).d)).reason, "not_signed_in");
  assert.equal((await testProvider("subscription", undefined, deps(() => models(), null).d)).reason, "cli_missing");
});

test("select: block reasons always refuse, accept reasons only when accepted", async () => {
  store.deleteProviderKey("openai");
  assert.deepStrictEqual(await selectProvider("openai", true, deps(() => models()).d), { ok: false, reason: "key_missing" });
  store.saveProviderConfig("openai", { apiKey: KEY });
  const down = () => deps(() => new TypeError("fetch failed")).d;
  assert.deepStrictEqual(await selectProvider("openai", false, down()), { ok: false, reason: "unreachable", detail: undefined });
  assert.deepStrictEqual(await selectProvider("openai", true, down()), { ok: true });
  assert.equal(store.getSelection()?.provider, "openai");
  const rejected = await selectProvider("openai", true, deps(() => new Response("", { status: 401 })).d);
  assert.equal(rejected.ok ? "" : rejected.reason, "key_invalid", "a rejected key is never accepted");
});

test("the view never carries key material", async () => {
  const json = JSON.stringify(await providersView());
  assert.ok(!json.includes("SENTINEL") && !json.includes("official-key") && !json.includes("aes1:"));
});

test("plans map from the CLI's subscription type; anything else is unknown, never free", () => {
  assert.deepStrictEqual(
    ["max_20x", "pro", "free", "team", "enterprise", "", undefined, 42].map(planFromSubscriptionType),
    ["max", "pro", "free", "custom", "custom", "unknown", "unknown", "unknown"],
  );
});

test("an empty draft is no draft: a re-check records the stored config's status", async () => {
  store.saveProviderConfig("anthropic_api", { apiKey: "sk-ant-api03-official-key-0000" });
  await testProvider("anthropic_api", {}, deps(() => new Response("", { status: 401 })).d);
  const status = (await providersView()).providers.find((p) => p.id === "anthropic_api")!.status;
  assert.deepStrictEqual([status.available, status.reason, typeof status.checkedAt], [false, "key_invalid", "number"]);
});
