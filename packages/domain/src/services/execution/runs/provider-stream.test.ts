/**
 * Fail-fast and classification for non-subscription providers; subscription behaviour unchanged.
 *
 *   pnpm --filter @agent-office/domain test src/services/execution/runs/provider-stream.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { classifyProviderResult, failFastOnEvent, initModel, MAX_CONNECT_RETRIES } from "./provider-stream";
import { classifyExitFailure, classifyResultError, scrubMaskedKeys } from "./errors";

const retry = (error_status: number | null, attempt = 1, error = "x") => ({ type: "system", subtype: "api_retry", attempt, max_retries: 10, error_status, error });

test("api_retry: 401/403/404 end a gateway run at once; a refused connection after the threshold", () => {
  assert.deepStrictEqual(failFastOnEvent("openai", retry(401)), { code: "provider_auth_failed", detail: "http_401" });
  assert.deepStrictEqual(failFastOnEvent("anthropic_api", retry(403)), { code: "provider_auth_failed", detail: "http_403" });
  assert.deepStrictEqual(failFastOnEvent("local", retry(404)), { code: "provider_model_not_found", detail: "http_404" });
  assert.equal(failFastOnEvent("local", retry(null, MAX_CONNECT_RETRIES - 1)), null);
  assert.deepStrictEqual(failFastOnEvent("local", retry(null, MAX_CONNECT_RETRIES, "unknown")), { code: "provider_unreachable", detail: "unknown" });
  assert.equal(failFastOnEvent("openai", retry(429)), null, "a rate limit keeps the CLI's own retries");
  assert.equal(failFastOnEvent("openai", retry(500)), null);
});

test("subscription keeps today's behaviour: its retries are the CLI's business", () => {
  assert.equal(failFastOnEvent("subscription", retry(401)), null);
  assert.equal(failFastOnEvent("subscription", retry(null, 9)), null);
});

test("init: any key source but none is a mismatch, for every provider; the model is read", () => {
  const init = (apiKeySource: string) => ({ type: "system", subtype: "init", apiKeySource, model: "qwen3:30b" });
  for (const p of ["subscription", "anthropic_api", "openai", "local"] as const) {
    assert.equal(failFastOnEvent(p, init("none")), null);
    assert.deepStrictEqual(failFastOnEvent(p, init("apiKeyHelper")), { code: "provider_mismatch", detail: "apiKeyHelper" });
  }
  assert.deepStrictEqual(failFastOnEvent("subscription", init("ANTHROPIC_API_KEY")), { code: "provider_mismatch", detail: "ANTHROPIC_API_KEY" });
  assert.equal(failFastOnEvent("subscription", init("oauth")), null, "an unknown non-env value is logged, not fatal");
  assert.equal(failFastOnEvent("subscription", init("claude.ai")), null);
  assert.equal(initModel(init("none")), "qwen3:30b");
  assert.equal(initModel({ type: "result" }), undefined);
  assert.equal(failFastOnEvent("openai", "garbage"), null);
});

test("a final result on a gateway provider is classified by status, then by text", () => {
  const result = (api_error_status: number | null, text: string) => ({ type: "result", is_error: true, api_error_status, result: text });
  assert.deepStrictEqual(classifyProviderResult("openai", result(401, "Not logged in · Please run /login")), { code: "provider_auth_failed", detail: "http_401" });
  assert.deepStrictEqual(classifyProviderResult("local", result(null, "API Error: Connection refused (ECONNREFUSED)")), { code: "provider_unreachable" });
  assert.equal(classifyProviderResult("subscription", result(401, "Not logged in")), null);
  assert.equal(classifyProviderResult("openai", { type: "result", is_error: false }), null);
});

test("the Sign-in card is only ever for the subscription", () => {
  assert.equal(classifyResultError("Invalid API key · Fix external API key", "", "subscription").code, "auth_expired");
  assert.equal(classifyResultError("Invalid API key · Fix external API key", "", "openai").code, "provider_auth_failed");
  assert.equal(classifyResultError("", "Not logged in · Please run /login", "local").code, "provider_auth_failed");
  assert.equal(classifyResultError("Your organization has disabled Claude subscription access", "", "anthropic_api").code, "unknown");
  assert.equal(classifyExitFailure("Not logged in · Please run /login", 1, { provider: "openai" }).code, "provider_auth_failed");
});

test("masked keys are scrubbed from upstream text; ordinary words are not", () => {
  assert.equal(scrubMaskedKeys("Incorrect API key provided: sk-proj-****abcd1234. See docs."), "Incorrect API key provided: ***. See docs.");
  assert.equal(scrubMaskedKeys("x-api-key sk-ant-api03-AAAAAAAAAAAA"), "x-api-key ***");
  for (const benign of ["disk-backed-index", "task-runner-v2", "risk-assessment", "sk-short"]) assert.equal(scrubMaskedKeys(benign), benign);
});
