"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_ROUTES } from "@agent-office/api-contract";
import type {
  Provider,
  ProviderCapabilities,
  ProvidersResponse,
  ProviderView,
} from "@agent-office/domain/types";
import { apiFetch } from "@/lib/api/fetch";
import { queryKeys } from "@/lib/api/query-keys";

/** GET /api/providers makes no network call, so it is cheap to keep fresh. */
export function useProviders() {
  return useQuery({
    queryKey: queryKeys.providers.state(),
    queryFn: () => apiFetch<ProvidersResponse>(API_ROUTES.providers),
    staleTime: 15_000,
  });
}

/** Everything the pre-provider app could do, so a loading or failed read changes nothing. */
const SUBSCRIPTION_CAPABILITIES: ProviderCapabilities = {
  accounts: true,
  plan: true,
  effort: true,
  costKnown: true,
  rateLimitWindow: true,
  resume: true,
  tools: true,
};

export interface ActiveProvider {
  id: Provider;
  view: ProviderView | undefined;
  capabilities: ProviderCapabilities;
  /** False until the server has answered, so callers can tell "subscription" from "unknown yet". */
  known: boolean;
}

/**
 * The provider agents run on now, for surfaces that only need to know what it
 * can do. Defaults to the subscription's abilities while loading or on error:
 * a surface must never vanish just because the provider read is slow.
 */
export function useActiveProvider(): ActiveProvider {
  const q = useProviders();
  const selected = q.data?.selected ?? null;
  const view = q.data?.providers.find((p) => p.id === selected);
  if (!selected || !view) {
    return { id: "subscription", view: undefined, capabilities: SUBSCRIPTION_CAPABILITIES, known: false };
  }
  return { id: selected, view, capabilities: view.capabilities, known: true };
}

export function useDeleteProviderKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: Provider) => apiFetch<void>(API_ROUTES.providerKey(id), { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.providers.all }),
  });
}
