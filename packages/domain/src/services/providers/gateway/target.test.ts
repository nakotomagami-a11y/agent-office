/**
 * Which upstream, which key, which model: a key only for its own normalized URL, only a mapped
 * model, the cap parameter swapped once and only on the API's own complaint.
 *
 *   pnpm --filter @agent-office/domain test src/services/providers/gateway/target.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sandbox = mkdtempSync(join(tmpdir(), "ao-gateway-target-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;

const { chatTarget, passthroughTarget } = await import("./target");
const { capParamFor, capRetry, rememberCapParam } = await import("./cap");
const store = await import("../store");
const { getDb } = await import("../../db/connection");
const tokens = await import("../gateway-tokens");

const MODELS = { haiku: "small", sonnet: "mid", opus: "big" };

test("openai: only a mapped model, never a claude id, and the key bound to the URL", () => {
  assert.deepStrictEqual(chatTarget("openai", "mid"), { ok: false, status: 400, type: "invalid_request_error", code: "provider_unavailable", detail: "invalid_config" });
  store.saveProviderConfig("openai", { apiKey: "sk-proj-target-key-0000000000", models: MODELS });
  assert.deepStrictEqual(chatTarget("openai", "mid"), { ok: true, url: "https://api.openai.com/v1/chat/completions", key: "sk-proj-target-key-0000000000", model: "mid" });
  for (const model of ["claude-opus-5-5", "opus", "unmapped"]) {
    const r = chatTarget("openai", model);
    assert.ok(!r.ok && r.code === "provider_model_not_found", model);
  }
});

test("a key re-bound to another URL behind the store's back is never sent", () => {
  getDb().prepare("UPDATE provider_configs SET secret_base_url = 'https://evil.test/v1' WHERE provider = 'openai'").run();
  const r = chatTarget("openai", "mid");
  assert.ok(!r.ok && r.code === "provider_auth_failed");
});

test("local without a key is fine; with an unreadable one it is refused", () => {
  store.saveProviderConfig("local", { baseUrl: "http://localhost:11434/v1", models: MODELS });
  assert.deepStrictEqual(chatTarget("local", "big"), { ok: true, url: "http://localhost:11434/v1/chat/completions", key: undefined, model: "big" });
  getDb().prepare("UPDATE provider_configs SET secret = 'not-ciphertext', secret_base_url = 'http://localhost:11434/v1' WHERE provider = 'local'").run();
  const r = chatTarget("local", "big");
  assert.ok(!r.ok && r.detail === "key_unreadable");
});

test("anthropic_api passthrough: the fixed official URL, and no key means no request", () => {
  assert.ok(!passthroughTarget().ok);
  store.saveProviderConfig("anthropic_api", { apiKey: "sk-ant-api03-passthrough-0000" });
  assert.deepStrictEqual(passthroughTarget(), { ok: true, url: "https://api.anthropic.com/v1/messages", key: "sk-ant-api03-passthrough-0000", model: "" });
});

test("the cap: a name swap only on an explicit unsupported-parameter message, a clamp on a stated ceiling", () => {
  const err = (message: string) => ({ error: { message } });
  assert.equal(capRetry("max_completion_tokens", 32000, err("Invalid API key")), null);
  assert.equal(capRetry("max_completion_tokens", 32000, null), null);
  assert.equal(capRetry("max_completion_tokens", 32000, err("max_completion_tokens: weird")), null, "a bare mention is not enough");
  assert.deepStrictEqual(capRetry("max_completion_tokens", 32000, err("Unsupported parameter: max_completion_tokens is not supported with this model. Use max_tokens instead.")), { param: "max_tokens" });
  assert.deepStrictEqual(capRetry("max_tokens", 32000, err("max_tokens is too large: 32000. This model supports at most 16384 completion tokens.")), { param: "max_tokens", maxTokens: 16384 });
});

test("the swapped name is remembered only when the caller says the retry worked", () => {
  assert.equal(capParamFor("openai", "gpt-x"), "max_completion_tokens");
  assert.equal(capParamFor("local", "qwen"), "max_tokens");
  capRetry("max_completion_tokens", 32000, { error: { message: "max_completion_tokens is not supported" } });
  assert.equal(capParamFor("openai", "gpt-x"), "max_completion_tokens", "a guess changes nothing");
  rememberCapParam("openai", "gpt-x", "max_tokens");
  assert.equal(capParamFor("openai", "gpt-x"), "max_tokens");
});

test("tokens: a never-issued or revoked token is refused; a second module instance sees the same registry", async () => {
  assert.equal(tokens.lookupGatewayToken("never-issued"), null);
  const token = tokens.issueGatewayToken("run-1", "openai");
  const other = await import(`../gateway-tokens.ts?instance=${Date.now()}`);
  assert.notEqual(other, tokens, "a separate module instance");
  assert.deepStrictEqual(other.lookupGatewayToken(token), { ownerId: "run-1", provider: "openai" });
  other.revokeGatewayTokens("run-1");
  assert.equal(tokens.lookupGatewayToken(token), null);
});
