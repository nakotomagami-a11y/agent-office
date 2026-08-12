"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { GithubAccount, GithubAccountWithStatus } from "@agent-office/domain/types";

export { ApiError };
export type { GithubAccount, GithubAccountWithStatus };

export function useGithubAccounts() {
  return useQuery({
    queryKey: queryKeys.githubAccounts.list(),
    queryFn: () => apiFetch<GithubAccountWithStatus[]>(API_ROUTES.githubAccounts),
  });
}

/**
 * Polls the account's status every 2 seconds while enabled. Used by the
 * add-account modal to detect when `gh` reports an authenticated user after the
 * user finishes `gh auth login` in a terminal.
 */
export function useGithubAccountStatus(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.githubAccounts.status(id ?? "__none"),
    queryFn: () => apiFetch<GithubAccountWithStatus>(API_ROUTES.githubAccountStatus(id!)),
    enabled: !!id && enabled,
    refetchInterval: enabled ? 2000 : false,
  });
}

export function useCreateGithubAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label: string) =>
      apiFetch<GithubAccount>(API_ROUTES.githubAccounts, { method: "POST", body: { label } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.githubAccounts.list() });
    },
  });
}

export function useRenameGithubAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; label: string }) =>
      apiFetch<GithubAccount>(API_ROUTES.githubAccountById(args.id), {
        method: "PATCH",
        body: { label: args.label },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.githubAccounts.list() });
    },
  });
}

export function useDeleteGithubAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(API_ROUTES.githubAccountById(id), { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.githubAccounts.list() });
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}
