import type { ModelTier } from "@agent-office/domain/config/providers";
import type { Provider, ProviderModels, ProviderView, ProvidersResponse } from "@agent-office/domain/types";
import { sameBaseUrl } from "./provider-format";

export interface ProviderDraft {
  baseUrl: string;
  /** Held in component state only. It is sent in one request and cleared; it never reaches a cache. */
  apiKey: string;
  models: ProviderModels;
}

export const EMPTY_DRAFT: ProviderDraft = { baseUrl: "", apiKey: "", models: {} };

export const usesBaseUrl = (p: Provider): boolean => p === "openai" || p === "local";

export function draftFromView(view: ProviderView | undefined): ProviderDraft {
  return { baseUrl: view?.config.baseUrl ?? "", apiKey: "", models: { ...(view?.config.models ?? {}) } };
}

const TIERS = ["haiku", "sonnet", "opus"] as const;

/** The part of a draft worth sending: only what differs from what is stored. Null when nothing does. */
export function requestBody(provider: Provider, draft: ProviderDraft, view: ProviderView | undefined) {
  const body: { baseUrl?: string | null; apiKey?: string; models?: Partial<Record<ModelTier, string | null>> } = {};
  if (usesBaseUrl(provider) && !sameBaseUrl(draft.baseUrl, view?.config.baseUrl)) {
    body.baseUrl = draft.baseUrl.trim() === "" ? null : draft.baseUrl.trim();
  }
  if (draft.apiKey.trim()) body.apiKey = draft.apiKey.trim();
  if (usesBaseUrl(provider)) {
    const stored = view?.config.models ?? {};
    const changed = TIERS.filter((tier) => (draft.models[tier] ?? "") !== (stored[tier] ?? ""));
    // The server merges per tier: a tier left out is untouched, a null clears it.
    if (changed.length > 0) body.models = Object.fromEntries(changed.map((tier) => [tier, draft.models[tier] ?? null]));
  }
  return Object.keys(body).length > 0 ? body : null;
}

/** Whether saving this draft would drop the stored key: the server binds a key to its address. */
export function keyWillBeCleared(draft: ProviderDraft, view: ProviderView | undefined): boolean {
  return Boolean(view?.keyHint) && !draft.apiKey.trim() && !sameBaseUrl(draft.baseUrl, view?.config.baseUrl);
}

export type Drafts = Partial<Record<Provider, ProviderDraft>>;

/**
 * The picked provider and every draft when the server's answer first arrives. The server's
 * selection wins over a wizard draft's, because it is what is actually saved; a draft only
 * fills a provider the server has no config for.
 */
export function startingDrafts(
  data: ProvidersResponse,
  saved: { provider: Provider | null; baseUrl: string; models: ProviderModels } | undefined,
): { choice: Provider; drafts: Drafts } {
  const drafts: Drafts = {};
  for (const view of data.providers) drafts[view.id] = draftFromView(view);
  if (saved?.provider && !data.providers.find((v) => v.id === saved.provider)?.configured) {
    drafts[saved.provider] = { baseUrl: saved.baseUrl, apiKey: "", models: saved.models };
  }
  return { choice: data.selected ?? saved?.provider ?? "subscription", drafts };
}
