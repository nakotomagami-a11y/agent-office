"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { Account, AccountWithStatus } from "@agent-office/domain/types";

export { ApiError };
export type { Account, AccountWithStatus };

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts.list(),
    queryFn: () => apiFetch<AccountWithStatus[]>(API_ROUTES.accounts),
  });
}

/**
 * Polls the account's status every 2 seconds while enabled. Used by the
 * add-account modal to detect when `.credentials.json` shows up after the
 * user finishes `claude login` in a terminal.
 */
export function useAccountStatus(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.accounts.status(id ?? "__none"),
    queryFn: () => apiFetch<AccountWithStatus>(API_ROUTES.accountStatus(id!)),
    enabled: !!id && enabled,
    refetchInterval: enabled ? 2000 : false,
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label: string) =>
      apiFetch<Account>(API_ROUTES.accounts, { method: "POST", body: { label } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.accounts.list() });
    },
  });
}

export function useRenameAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; label: string }) =>
      apiFetch<Account>(API_ROUTES.accountById(args.id), {
        method: "PATCH",
        body: { label: args.label },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.accounts.list() });
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(API_ROUTES.accountById(id), { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.accounts.list() });
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}
