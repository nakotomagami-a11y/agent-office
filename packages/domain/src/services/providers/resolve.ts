// Which provider runs, and whether it can. Pure and total: a stored choice is never swapped for
// another provider, and garbage is `invalid_config`, never a default (docs/architecture.md, "AI providers").

import { isProvider, MODEL_TIERS } from "../../config/providers";
import type { Provider, ProviderStatusReason } from "../../types/index";
import type { SettingsFileState } from "../settings";

/** What the store knows without any network call. */
export interface ProviderPresence {
  configValid: boolean;
  baseUrlValid: boolean;
  key: "present" | "missing" | "unreadable";
  tiersMapped: number;
}

export interface Unavailable {
  reason: ProviderStatusReason;
  detail?: string;
}

export interface ProviderResolution {
  provider: Provider | null;
  needsSetup: boolean;
  available: boolean;
  reason?: ProviderStatusReason;
  detail?: string;
}

const keyReason = (key: ProviderPresence["key"]): Unavailable | undefined =>
  key === "missing" ? { reason: "key_missing" } : key === "unreadable" ? { reason: "key_unreadable" } : undefined;

/** Presence only: a key that exists may still be rejected, which only a probe or a run tells. */
export function presenceReason(provider: Provider, p: ProviderPresence): Unavailable | undefined {
  if (provider === "subscription") return undefined;
  if (!p.configValid) return { reason: "invalid_config" };
  if (provider === "anthropic_api") return keyReason(p.key);
  if (!p.baseUrlValid) return { reason: "base_url_invalid" };
  if (provider === "openai") {
    const key = keyReason(p.key);
    if (key) return key;
  } else if (p.key === "unreadable") {
    return { reason: "key_unreadable" };
  }
  if (p.tiersMapped < MODEL_TIERS.length) return { reason: "invalid_config", detail: "tiers_unmapped" };
  return undefined;
}

export function resolveProvider(
  selection: { provider: string } | undefined,
  settings: SettingsFileState,
  presence: (p: Provider) => ProviderPresence,
): ProviderResolution {
  if (!selection) {
    if (settings.state === "unreadable") {
      return { provider: null, needsSetup: false, available: false, reason: "invalid_config", detail: "settings_unreadable" };
    }
    const legacy = settings.state === "readable" && settings.firstRunComplete;
    return legacy
      ? { provider: null, needsSetup: false, available: false, reason: "not_configured" }
      : { provider: null, needsSetup: true, available: false, reason: "not_configured" };
  }
  if (!isProvider(selection.provider)) {
    return { provider: null, needsSetup: false, available: false, reason: "invalid_config", detail: "unknown_provider" };
  }
  const missing = presenceReason(selection.provider, presence(selection.provider));
  return missing
    ? { provider: selection.provider, needsSetup: false, available: false, ...missing }
    : { provider: selection.provider, needsSetup: false, available: true };
}
