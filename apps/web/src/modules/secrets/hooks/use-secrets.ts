"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { SecretWithStatus } from "@agent-office/domain/types";

export { ApiError };
export type { SecretWithStatus };

export interface SecretInput {
  name: string;
  label?: string;
  value?: string;
  expiresAt?: number | null;
  testCmd?: string | null;
  verifyBeforeRun?: boolean;
}

export interface SecretTestResult {
  ok: boolean;
  output: string;
  skipped?: boolean;
}

export function useSecrets() {
  return useQuery({
    queryKey: queryKeys.secrets.list(),
    queryFn: () => apiFetch<SecretWithStatus[]>(API_ROUTES.secrets),
  });
}

export function useProjectSecrets(projectId: string | null) {
  return useQuery({
    queryKey: queryKeys.secrets.forProject(projectId ?? "__none"),
    queryFn: () => apiFetch<SecretWithStatus[]>(API_ROUTES.projectSecrets(projectId!)),
    enabled: !!projectId,
  });
}

export function useCreateSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SecretInput) =>
      apiFetch<SecretWithStatus>(API_ROUTES.secrets, { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.secrets.all }),
  });
}

export function useUpdateSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string } & SecretInput) => {
      const { id, ...body } = args;
      return apiFetch<SecretWithStatus>(API_ROUTES.secretById(id), { method: "PATCH", body });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.secrets.all }),
  });
}

export function useDeleteSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(API_ROUTES.secretById(id), { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.secrets.all }),
  });
}

export function useTestSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<SecretTestResult>(API_ROUTES.secretTest(id), { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.secrets.all }),
  });
}

export function useLinkSecret(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (secretId: string) =>
      apiFetch<SecretWithStatus[]>(API_ROUTES.projectSecrets(projectId), {
        method: "POST",
        body: { secretId },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.secrets.all }),
  });
}

export function useUnlinkSecret(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (secretId: string) =>
      apiFetch<void>(API_ROUTES.projectSecretById(projectId, secretId), { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.secrets.all }),
  });
}
