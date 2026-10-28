/**
 *   pnpm --filter @agent-office/domain test src/config/providers.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import {
  isBackendEnvName, isParentSessionEnvName, normalizeBaseUrl, PROVIDER_STATUS_REASON_POLICY, PROVIDER_STATUS_REASONS,
} from "./providers";

test("base URLs normalize to one form, so a key bound to one cannot match a lookalike", () => {
  assert.equal(normalizeBaseUrl("HTTPS://API.OpenAI.com:443/v1/"), "https://api.openai.com/v1");
  assert.equal(normalizeBaseUrl("http://localhost:11434/v1"), "http://localhost:11434/v1");
  assert.equal(normalizeBaseUrl("http://127.0.0.1/"), "http://127.0.0.1");
  assert.notEqual(normalizeBaseUrl("https://api.openai.com.evil.test/v1"), normalizeBaseUrl("https://api.openai.com/v1"));
  assert.notEqual(normalizeBaseUrl("http://localhost:1234"), normalizeBaseUrl("http://127.0.0.1:1234"));
});

test("base URLs with credentials, a query, a fragment or another scheme are refused", () => {
  for (const bad of ["http://user:pass@host/v1", "http://host/v1?key=x", "http://host/v1#x", "file:///etc", "ftp://host", "not a url", ""]) {
    assert.equal(normalizeBaseUrl(bad), null, bad);
  }
});

test("backend env names: the ANTHROPIC_ prefix, OAuth and the named backends, case-insensitively", () => {
  for (const name of ["ANTHROPIC_BASE_URL", "anthropic_api_key", "ANTHROPIC_FUTURE_THING", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "claude_code_use_vertex", "CLAUDE_CODE_API_KEY_HELPER_TTL_MS"]) {
    assert.ok(isBackendEnvName(name), name);
  }
  for (const name of ["CLAUDE_CODE_USE_POWERSHELL_TOOL", "OPENAI_API_KEY", "CLAUDE_CONFIG_DIR", "PATH", "GH_TOKEN"]) {
    assert.ok(!isBackendEnvName(name), name);
  }
});

test("parent-session variables are recognised but never treated as backend names", () => {
  assert.ok(isParentSessionEnvName("CLAUDECODE"));
  assert.ok(isParentSessionEnvName("CLAUDE_CODE_MESSAGING_SOCKET"));
  assert.ok(!isBackendEnvName("CLAUDECODE"));
});

test("every status reason has a policy, and the ones a save may accept are network-class only", () => {
  assert.deepStrictEqual(Object.keys(PROVIDER_STATUS_REASON_POLICY).sort(), [...PROVIDER_STATUS_REASONS].sort());
  const accepted = PROVIDER_STATUS_REASONS.filter((r) => PROVIDER_STATUS_REASON_POLICY[r] === "accept").sort();
  assert.deepStrictEqual(accepted, ["empty_response", "model_not_found", "no_models", "not_signed_in", "rate_limited", "timeout", "unreachable"]);
});
