// What the provider routes do: read the view, save a config, test, select. HTTP-agnostic results.

import { PROVIDER_STATUS_REASON_POLICY, PROVIDERS, type ProviderStatusReason } from "../../config/providers";
import type { Provider, ProviderConfig, ProvidersResponse, ProviderStatus, ProviderTestResult, ProviderView } from "../../types/index";
import { getHealth, peekHealth } from "../infra/health";
import { currentProvider, presenceFor } from "./current";
import { ensureProviderMigrated } from "./migrate";
import { priceTableDate } from "./prices/catalog";
import { presenceReason } from "./resolve";
import { probeProvider, toStatus, type ProbeDeps } from "./status";
import { getSelection, keyHint, readProvider, readProviderKey, saveProviderConfig, setSelection, type ProviderConfigInput, type SaveResult } from "./store";
import { cachedStatus, defaultProbeDeps, forgetStatus, rememberStatus } from "./status-cache";
import { keyTargetUrl, normalizeBaseUrl } from "./urls";

const CAPABILITIES: Record<Provider, ProviderView["capabilities"]> = {
  subscription: { accounts: true, plan: true, effort: true, costKnown: true, rateLimitWindow: true, resume: true, tools: true },
  anthropic_api: { accounts: true, plan: false, effort: true, costKnown: true, rateLimitWindow: false, resume: true, tools: true },
  openai: { accounts: true, plan: false, effort: false, costKnown: false, rateLimitWindow: false, resume: true, tools: true },
  local: { accounts: true, plan: false, effort: false, costKnown: true, rateLimitWindow: false, resume: true, tools: true },
};

function statusOf(provider: Provider): ProviderStatus {
  const missing = presenceReason(provider, presenceFor(provider));
  if (missing) return { available: false, ...missing };
  return cachedStatus(provider) ?? { available: true };
}

function viewOf(provider: Provider): ProviderView {
  const stored = readProvider(provider);
  return {
    id: provider,
    configured: provider === "subscription" || !!stored,
    hasKey: stored?.hasKey ?? false,
    keyHint: keyHint(provider),
    config: stored?.config ?? {},
    status: statusOf(provider),
    capabilities: CAPABILITIES[provider],
    ...(provider === "openai" ? { priceTableDate: priceTableDate() } : {}),
  };
}

/** No network: presence plus the last probe, if still fresh. */
export async function providersView(): Promise<ProvidersResponse> {
  ensureProviderMigrated();
  const selection = getSelection();
  const resolved = currentProvider();
  const cli = await getHealth();
  return {
    selected: resolved.provider,
    source: selection?.source,
    changedAt: selection?.changedAt,
    needsSetup: resolved.needsSetup,
    cli: { available: cli.available, version: cli.version ?? undefined },
    providers: PROVIDERS.map(viewOf),
  };
}

export function saveConfig(provider: Provider, input: ProviderConfigInput): SaveResult {
  const result = saveProviderConfig(provider, input);
  if (result.ok) forgetStatus(provider);
  return result;
}

/**
 * The stored key goes only to the URL it was saved for: a draft naming another URL is tested with
 * the draft's own key or none, never the stored one (Q-50).
 */
export async function testProvider(
  provider: Provider,
  draft: ProviderConfigInput | undefined,
  deps: ProbeDeps = defaultProbeDeps(),
): Promise<ProviderTestResult> {
  if (draft && Object.values(draft).every((v) => v === undefined)) draft = undefined;
  const stored = readProvider(provider)?.config ?? {};
  const baseUrl = draft?.baseUrl === null ? undefined : draft?.baseUrl ? normalizeBaseUrl(draft.baseUrl) ?? draft.baseUrl : stored.baseUrl;
  const config: ProviderConfig = { ...stored, baseUrl, models: { ...stored.models, ...definedModels(draft) } };
  const target = keyTargetUrl(provider, config);
  const storedKey = target ? readProviderKey(provider, target) : undefined;
  const key = draft?.apiKey || (storedKey?.ok ? storedKey.key : undefined);
  if (!key && storedKey && !storedKey.ok && storedKey.reason === "key_unreadable") {
    return { ok: false, reason: "key_unreadable", latencyMs: 0 };
  }
  if (!key && (provider === "openai" || provider === "anthropic_api")) return { ok: false, reason: "key_missing", latencyMs: 0 };
  const result = await probeProvider(provider, { config, key }, deps);
  if (!draft) rememberStatus(provider, toStatus(result));
  return result;
}

function definedModels(draft: ProviderConfigInput | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(draft?.models ?? {}).filter((e): e is [string, string] => typeof e[1] === "string"));
}

export type SelectResult = { ok: true } | { ok: false; reason: ProviderStatusReason; detail?: string };

/** Block reasons always refuse; accept reasons only with `acceptUnavailable` (G-2 B). */
export async function selectProvider(provider: Provider, acceptUnavailable: boolean, deps?: ProbeDeps): Promise<SelectResult> {
  const missing = presenceReason(provider, presenceFor(provider));
  if (missing) return { ok: false, ...missing };
  if (peekHealth()?.available === false) return { ok: false, reason: "cli_missing" };
  const probe = await testProvider(provider, undefined, deps);
  if (!probe.ok && probe.reason) {
    const accepted = PROVIDER_STATUS_REASON_POLICY[probe.reason] === "accept" && acceptUnavailable;
    if (!accepted) return { ok: false, reason: probe.reason, detail: probe.detail };
  }
  setSelection(provider, "chosen");
  return { ok: true };
}
