/**
 * The `--settings` pin (golden JSON per provider) and the process-env scrub. A repo's settings env
 * outranks the process env, so the pin is what actually holds the provider; `apiKeyHelper` must be
 * `""`: null makes the CLI exit 1, omitted lets a repo helper choose the key (verified on 2.1.296).
 *
 *   pnpm --filter @agent-office/domain test src/services/providers/env.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { applyProviderEnv, buildSettingsPin, scrubBackendEnv } from "./env";

// Literal on purpose: dropping a name from the pinned list must fail here.
const blank = Object.fromEntries([
  "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_CUSTOM_HEADERS",
  "ANTHROPIC_DEFAULT_FABLE_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_MODEL", "ANTHROPIC_SMALL_FAST_MODEL", "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_SUBAGENT_MODEL", "CLAUDE_CODE_USE_ANTHROPIC_AWS", "CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD",
  "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_FOUNDRY", "CLAUDE_CODE_USE_GATEWAY", "CLAUDE_CODE_USE_MANTLE",
  "CLAUDE_CODE_USE_VERTEX",
].map((n) => [n, ""]));
const gateway = { gatewayUrl: "http://127.0.0.1:3000/api/gateway", token: "run-token" };
const models = { haiku: "small", sonnet: "mid", opus: "big" };

test("subscription: every backend name pinned empty, helper off", () => {
  const pin = buildSettingsPin({ provider: "subscription" });
  assert.equal(JSON.stringify(pin), JSON.stringify({ apiKeyHelper: "", env: blank }));
});

test("anthropic_api: gateway URL and run token only, never a key", () => {
  const pin = buildSettingsPin({ provider: "anthropic_api", ...gateway });
  assert.deepStrictEqual(pin.env, { ...blank, ANTHROPIC_BASE_URL: gateway.gatewayUrl, ANTHROPIC_AUTH_TOKEN: "run-token" });
  assert.equal((pin.env as Record<string, string>).ANTHROPIC_API_KEY, "");
});

test("openai: gateway plus the tier map", () => {
  const pin = buildSettingsPin({ provider: "openai", ...gateway, models });
  assert.deepStrictEqual(pin.env, {
    ...blank,
    ANTHROPIC_BASE_URL: gateway.gatewayUrl,
    ANTHROPIC_AUTH_TOKEN: "run-token",
    ANTHROPIC_MODEL: "mid",
    ANTHROPIC_SMALL_FAST_MODEL: "small",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "small",
    ANTHROPIC_DEFAULT_SONNET_MODEL: "mid",
    ANTHROPIC_DEFAULT_OPUS_MODEL: "big",
    ANTHROPIC_DEFAULT_FABLE_MODEL: "big",
  });
});

test("local: as openai, plus few retries", () => {
  const pin = buildSettingsPin({ provider: "local", ...gateway, models });
  assert.equal(pin.env.CLAUDE_CODE_MAX_RETRIES, "2");
  assert.equal(pin.env.ANTHROPIC_DEFAULT_OPUS_MODEL, "big");
});

test("backend names a settings file sets are pinned empty too; other names are not pinned", () => {
  const pin = buildSettingsPin({ provider: "subscription" }, ["ANTHROPIC_FUTURE_THING", "OPENAI_API_KEY", "ANTHROPIC_BASE_URL"]);
  assert.equal(pin.env.ANTHROPIC_FUTURE_THING, "");
  assert.ok(!("OPENAI_API_KEY" in pin.env));
  assert.deepStrictEqual(Object.keys(pin.env), [...Object.keys(pin.env)].sort(), "keys sorted");
});

test("the scrub drops backend and parent-session vars in any case, and keeps everything else", () => {
  const env: NodeJS.ProcessEnv = {
    ANTHROPIC_BASE_URL: "http://evil", Anthropic_Api_Key: "sk-x", ANTHROPIC_FUTURE_THING: "1",
    CLAUDE_CODE_OAUTH_TOKEN: "t", CLAUDE_CODE_USE_BEDROCK: "1", CLAUDE_CODE_SUBAGENT_MODEL: "m",
    CLAUDECODE: "1", CLAUDE_CODE_MESSAGING_TOKEN: "m", CLAUDE_EFFORT: "high",
    OPENAI_API_KEY: "keep", CLAUDE_CONFIG_DIR: "keep", CLAUDE_CODE_USE_POWERSHELL_TOOL: "keep", PATH: "keep",
  };
  scrubBackendEnv(env);
  assert.deepStrictEqual(env, { OPENAI_API_KEY: "keep", CLAUDE_CONFIG_DIR: "keep", CLAUDE_CODE_USE_POWERSHELL_TOOL: "keep", PATH: "keep" });
});

test("the process env gets only values, and the gateway host joins NO_PROXY", () => {
  const env: NodeJS.ProcessEnv = { NO_PROXY: "corp.local" };
  applyProviderEnv(env, { provider: "openai", ...gateway, models });
  assert.equal(env.ANTHROPIC_BASE_URL, gateway.gatewayUrl);
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.NO_PROXY, "corp.local,127.0.0.1");
  assert.equal(env.no_proxy, "127.0.0.1");
  const sub: NodeJS.ProcessEnv = {};
  applyProviderEnv(sub, { provider: "subscription" });
  assert.deepStrictEqual(sub, {});
});
