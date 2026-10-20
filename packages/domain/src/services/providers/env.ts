// What a `claude` child sees of the provider: the process env, and the same values pinned in its
// `--settings` file, which outranks a repo's own settings env (docs/architecture.md, "AI providers").

import {
  isBackendEnvName, isParentSessionEnvName, LOCAL_MAX_RETRIES, PINNED_ENV_NAMES, usesGateway,
} from "../../config/providers";
import type { Provider, ProviderModels } from "../../types/index";

export interface ProviderEnvInput {
  provider: Provider;
  /** Gateway providers only. */
  gatewayUrl?: string;
  token?: string;
  models?: ProviderModels;
}

export interface SettingsPin {
  /** `""`, never null or omitted: null makes the CLI exit 1, omitted lets a repo helper pick the key. */
  apiKeyHelper: "";
  env: Record<string, string>;
}

export function scrubBackendEnv(env: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(env)) {
    if (isBackendEnvName(key) || isParentSessionEnvName(key)) delete env[key];
  }
}

/** Values for every pinned name; `""` unsets it in the CLI. */
export function providerEnv(input: ProviderEnvInput): Record<string, string> {
  const env: Record<string, string> = Object.fromEntries(PINNED_ENV_NAMES.map((n) => [n, ""]));
  if (!usesGateway(input.provider)) return env;
  env.ANTHROPIC_BASE_URL = input.gatewayUrl ?? "";
  env.ANTHROPIC_AUTH_TOKEN = input.token ?? "";
  if (input.provider === "anthropic_api") return env;
  const models = input.models ?? {};
  env.ANTHROPIC_MODEL = models.sonnet ?? "";
  env.ANTHROPIC_SMALL_FAST_MODEL = models.haiku ?? "";
  env.ANTHROPIC_DEFAULT_HAIKU_MODEL = models.haiku ?? "";
  env.ANTHROPIC_DEFAULT_SONNET_MODEL = models.sonnet ?? "";
  env.ANTHROPIC_DEFAULT_OPUS_MODEL = models.opus ?? "";
  env.ANTHROPIC_DEFAULT_FABLE_MODEL = models.opus ?? "";
  if (input.provider === "local") env.CLAUDE_CODE_MAX_RETRIES = String(LOCAL_MAX_RETRIES);
  return env;
}

/** `extraNames`: backend names a user or repo settings file sets, which the fixed list lacks. */
export function buildSettingsPin(input: ProviderEnvInput, extraNames: readonly string[] = []): SettingsPin {
  const env = providerEnv(input);
  for (const name of extraNames) if (!(name in env) && isBackendEnvName(name)) env[name] = "";
  const sorted = Object.fromEntries(Object.entries(env).sort(([a], [b]) => (a < b ? -1 : 1)));
  return { apiKeyHelper: "", env: sorted };
}

/** Process env: set only what has a value. The scrub already removed the rest. */
export function applyProviderEnv(env: NodeJS.ProcessEnv, input: ProviderEnvInput): void {
  for (const [name, value] of Object.entries(providerEnv(input))) if (value) env[name] = value;
  if (!input.gatewayUrl) return;
  const host = new URL(input.gatewayUrl).hostname;
  for (const name of ["NO_PROXY", "no_proxy"]) {
    const current = env[name];
    env[name] = current ? `${current},${host}` : host;
  }
}
