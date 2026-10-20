// Which AI backend agents run on (docs/architecture.md, "AI providers"). Browser-safe: no imports.

export const PROVIDERS = ["subscription", "anthropic_api", "openai", "local"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const isProvider = (v: unknown): v is Provider =>
  typeof v === "string" && (PROVIDERS as readonly string[]).includes(v);

/** Everything but the subscription reaches its backend through the in-process gateway. */
export const usesGateway = (p: Provider): boolean => p !== "subscription";

export const PROVIDER_STATUS_REASONS = [
  "not_configured",
  "invalid_config",
  "cli_missing",
  "not_signed_in",
  "key_missing",
  "key_unreadable",
  "key_invalid",
  "unreachable",
  "timeout",
  "empty_response",
  "no_models",
  "model_not_found",
  "rate_limited",
  "base_url_invalid",
  "budget_unenforceable",
] as const;
export type ProviderStatusReason = (typeof PROVIDER_STATUS_REASONS)[number];
export const isProviderStatusReason = (v: unknown): v is ProviderStatusReason =>
  typeof v === "string" && (PROVIDER_STATUS_REASONS as readonly string[]).includes(v);

/** `accept`: the user may save the provider anyway ("Continue anyway"). `block`: never. */
export const PROVIDER_STATUS_REASON_POLICY: Record<ProviderStatusReason, "block" | "accept"> = {
  not_configured: "block",
  invalid_config: "block",
  cli_missing: "block",
  not_signed_in: "accept",
  key_missing: "block",
  key_unreadable: "block",
  key_invalid: "block",
  unreachable: "accept",
  timeout: "accept",
  empty_response: "accept",
  no_models: "accept",
  model_not_found: "accept",
  rate_limited: "accept",
  base_url_invalid: "block",
  budget_unenforceable: "block",
};

export const MODEL_TIERS = ["haiku", "sonnet", "opus"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];
export const isModelTier = (v: unknown): v is ModelTier =>
  typeof v === "string" && (MODEL_TIERS as readonly string[]).includes(v);

/** What a run's `cost_usd` means. `unknown` is never summed as $0. */
export const COST_BASES = ["notional", "billed", "estimated", "unknown", "free"] as const;
export type CostBasis = (typeof COST_BASES)[number];
export const isCostBasis = (v: unknown): v is CostBasis =>
  typeof v === "string" && (COST_BASES as readonly string[]).includes(v);

/**
 * Env that selects the CLI's backend or its credential: scrubbed from every spawn, pinned in the
 * `--settings` file, and reserved against project secrets. Only `CLAUDE_CODE_USE_<backend>` names,
 * not the prefix: `CLAUDE_CODE_USE_POWERSHELL_TOOL` and friends are ordinary user settings.
 */
export const BACKEND_ENV_PREFIXES = ["ANTHROPIC_", "CLAUDE_CODE_OAUTH_", "CLAUDE_CODE_API_KEY_"] as const;
export const BACKEND_ENV_NAMES = [
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
  "CLAUDE_CODE_USE_MANTLE",
  "CLAUDE_CODE_USE_ANTHROPIC_AWS",
  "CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD",
  "CLAUDE_CODE_USE_GATEWAY",
  "CLAUDE_CODE_SUBAGENT_MODEL",
] as const;

/** Set only when the server itself was launched from a Claude Code session; never reserved. */
export const PARENT_SESSION_ENV_PREFIXES = ["CLAUDE_CODE_MESSAGING_"] as const;
export const PARENT_SESSION_ENV_NAMES = [
  "CLAUDECODE",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_CHILD_SESSION",
  "CLAUDE_CODE_AGENT",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_EXECPATH",
  "CLAUDE_CODE_SESSION_ATTENDED",
  "CLAUDE_PID",
  "CLAUDE_EFFORT",
] as const;

/** Pinned in every run's `--settings` file even when nothing set them. */
export const PINNED_ENV_NAMES = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_CUSTOM_HEADERS",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_SMALL_FAST_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_FABLE_MODEL",
  "CLAUDE_CODE_OAUTH_TOKEN",
  ...BACKEND_ENV_NAMES,
] as const;

const startsWithAny = (upper: string, prefixes: readonly string[]): boolean => prefixes.some((p) => upper.startsWith(p));

/** Case-insensitive, because Windows env lookup is. */
export function isBackendEnvName(name: string): boolean {
  const upper = name.toUpperCase();
  return startsWithAny(upper, BACKEND_ENV_PREFIXES) || (BACKEND_ENV_NAMES as readonly string[]).includes(upper);
}

/** Names a run never takes from a project secret: `AO_*` is the app's own namespace, and the
 *  backend names belong to the chosen provider. */
export function isReservedEnvName(name: string): boolean {
  return name.toUpperCase().startsWith("AO_") || isBackendEnvName(name);
}

export function isParentSessionEnvName(name: string): boolean {
  const upper = name.toUpperCase();
  return startsWithAny(upper, PARENT_SESSION_ENV_PREFIXES) || (PARENT_SESSION_ENV_NAMES as readonly string[]).includes(upper);
}

/**
 * One form for every comparison a stored key depends on: lowercase host, no default port, no
 * trailing slash. Userinfo, query and fragment are refused, so a key is never bound to a URL that
 * hides credentials or varies by query string.
 */
export function normalizeBaseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
}

export const PROVIDER_PROBE_TIMEOUT_MS = 5_000;
/** The CLI version the `--settings` pin was verified against; the settings-pin e2e fails on any other. */
export const PIN_VERIFIED_CLI_VERSION = "2.1.296";
/** A local server is either up or not: two retries, not the CLI's ten. */
export const LOCAL_MAX_RETRIES = 2;
