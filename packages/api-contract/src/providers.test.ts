/**
 *   pnpm --filter @agent-office/api-contract test src/providers.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { providerConfigPutSchema, providerSelectedPutSchema, providerTestSchema } from "./providers";
import { wizardDraftSchema } from "./schemas";

const SENTINEL = "sk-proj-SENTINEL-never-in-a-draft";

test("a wizard draft round-trips its provider fields and never keeps a key", () => {
  const draft = wizardDraftSchema.parse({
    step: "provider", provider: "local", baseUrl: "http://localhost:11434/v1",
    models: { haiku: "qwen3:8b", sonnet: "qwen3:8b", opus: "qwen3:32b" }, apiKey: SENTINEL, key: SENTINEL,
  });
  assert.deepStrictEqual(wizardDraftSchema.parse(JSON.parse(JSON.stringify(draft))), draft);
  assert.equal(draft.provider, "local");
  assert.ok(!JSON.stringify(draft).includes("SENTINEL"));
});

test("an old draft without provider fields still parses, with defaults", () => {
  const draft = wizardDraftSchema.parse({ step: "root" });
  assert.deepStrictEqual([draft.provider, draft.baseUrl, draft.models], [null, "", {}]);
});

test("base URLs with credentials or another scheme are refused at the boundary", () => {
  for (const baseUrl of ["http://u:p@host/v1", "file:///etc/passwd", "javascript:alert(1)", "http://host/v1?k=1"]) {
    assert.equal(providerConfigPutSchema.safeParse({ baseUrl }).success, false, baseUrl);
    assert.equal(wizardDraftSchema.safeParse({ step: "provider", baseUrl }).success, false, baseUrl);
  }
  assert.equal(providerConfigPutSchema.safeParse({ baseUrl: null }).success, true, "null removes it");
});

test("provider config is strict: an unknown field is an error, not silently dropped", () => {
  assert.equal(providerConfigPutSchema.safeParse({ secret_base_url: "http://evil" }).success, false);
  assert.equal(providerConfigPutSchema.safeParse({ models: { fable: "x" } }).success, false);
  assert.equal(providerConfigPutSchema.safeParse({ models: { opus: "" } }).success, false);
});

test("the selection takes only a known provider", () => {
  assert.equal(providerSelectedPutSchema.safeParse({ provider: "gpt" }).success, false);
  assert.deepStrictEqual(providerSelectedPutSchema.parse({ provider: "openai", acceptUnavailable: true }), { provider: "openai", acceptUnavailable: true });
  assert.deepStrictEqual(providerTestSchema.parse({}), {});
});
