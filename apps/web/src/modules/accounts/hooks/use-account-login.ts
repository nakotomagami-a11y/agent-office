"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";

export type LoginPhase = "starting" | "awaiting-code" | "success" | "error";
export interface LoginState {
  phase: LoginPhase;
  url?: string;
  message?: string;
}

export function useStartLogin() {
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<LoginState>(API_ROUTES.accountLogin(id), { method: "POST" }),
  });
}

export function useSubmitLoginCode() {
  return useMutation({
    mutationFn: (args: { id: string; code: string }) =>
      apiFetch<LoginState>(API_ROUTES.accountLoginCode(args.id), {
        method: "POST",
        body: { code: args.code },
      }),
  });
}

/** Poll login state every 1.5s while enabled (until success/error). */
export function useLoginState(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.accounts.login(id ?? "__none"),
    queryFn: () => apiFetch<LoginState>(API_ROUTES.accountLogin(id!)),
    enabled: !!id && enabled,
    refetchInterval: enabled ? 1500 : false,
  });
}

export function cancelLogin(id: string) {
  return apiFetch(API_ROUTES.accountLogin(id), { method: "DELETE" });
}
