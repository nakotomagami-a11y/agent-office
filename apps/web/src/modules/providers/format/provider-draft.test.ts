import assert from "node:assert";
import { test } from "node:test";
import type { ProviderView, ProvidersResponse } from "@agent-office/domain/types";
import { EMPTY_DRAFT, keyWillBeCleared, requestBody, startingDrafts } from "./provider-draft";

const caps = { accounts: true, plan: false, effort: false, costKnown: false, rateLimitWindow: false, resume: true, tools: true };
const view = (over: Partial<ProviderView> & Pick<ProviderView, "id">): ProviderView => ({
  configured: false,
  config: {},
  status: { available: false },
  capabilities: caps,
  ...over,
});
const response = (selected: ProvidersResponse["selected"], providers: ProviderView[]): ProvidersResponse => ({
  selected,
  needsSetup: selected === null,
  cli: { available: true },
  providers,
});

test("nothing is sent when nothing changed, so a test checks the stored config", () => {
  const stored = view({ id: "local", configured: true, config: { baseUrl: "http://localhost:11434/v1", models: { haiku: "m", sonnet: "m", opus: "m" } } });
  const draft = { baseUrl: "http://localhost:11434/v1/", apiKey: "", models: { haiku: "m", sonnet: "m", opus: "m" } };
  assert.equal(requestBody("local", draft, stored), null);
});

test("only the fields that differ are sent, and a typed key is always sent", () => {
  const stored = view({ id: "openai", configured: true, keyHint: "ab12", config: { models: { opus: "gpt-5" } } });
  assert.deepEqual(requestBody("openai", { ...EMPTY_DRAFT, models: { opus: "gpt-5-mini" } }, stored), { models: { opus: "gpt-5-mini" } });
  assert.deepEqual(requestBody("openai", { ...EMPTY_DRAFT, models: {} }, stored), { models: { opus: null } }, "clearing a stored tier sends null");
  assert.deepEqual(requestBody("openai", { ...EMPTY_DRAFT, apiKey: " sk-test ", models: { opus: "gpt-5" } }, stored), { apiKey: "sk-test" });
});

test("clearing the address of a provider that had one sends null, to go back to the official one", () => {
  const stored = view({ id: "openai", config: { baseUrl: "https://proxy.example/v1" } });
  assert.deepEqual(requestBody("openai", { ...EMPTY_DRAFT, baseUrl: "" }, stored), { baseUrl: null });
});

test("the Anthropic key provider never sends an address or models", () => {
  const body = requestBody("anthropic_api", { baseUrl: "http://x", apiKey: "k", models: { opus: "m" } }, view({ id: "anthropic_api" }));
  assert.deepEqual(body, { apiKey: "k" });
});

test("a saved key is dropped by the server when the address changes without a new key", () => {
  const stored = view({ id: "local", configured: true, keyHint: "wxyz", config: { baseUrl: "http://a/v1" } });
  assert.equal(keyWillBeCleared({ ...EMPTY_DRAFT, baseUrl: "http://b/v1" }, stored), true);
  assert.equal(keyWillBeCleared({ ...EMPTY_DRAFT, baseUrl: "http://b/v1", apiKey: "new" }, stored), false);
  assert.equal(keyWillBeCleared({ ...EMPTY_DRAFT, baseUrl: "http://a/v1/" }, stored), false);
  assert.equal(keyWillBeCleared({ ...EMPTY_DRAFT, baseUrl: "http://b/v1" }, view({ id: "local" })), false);
});

test("the server selection wins over a wizard draft, and the draft fills only an unconfigured provider", () => {
  const local = view({ id: "local", configured: true, config: { baseUrl: "http://stored/v1" } });
  const data = response("subscription", [view({ id: "subscription" }), view({ id: "openai" }), local]);
  const saved = { provider: "openai" as const, baseUrl: "https://drafted/v1", models: { opus: "gpt-5" } };
  const start = startingDrafts(data, saved);
  assert.equal(start.choice, "subscription");
  assert.equal(start.drafts.openai?.baseUrl, "https://drafted/v1");
  assert.equal(start.drafts.local?.baseUrl, "http://stored/v1");
  assert.equal(startingDrafts(response(null, data.providers), undefined).choice, "subscription");
  assert.equal(startingDrafts(response(null, data.providers), saved).choice, "openai");
  assert.equal(startingDrafts(response(null, [local]), { ...saved, provider: "local" }).drafts.local?.baseUrl, "http://stored/v1");
});
