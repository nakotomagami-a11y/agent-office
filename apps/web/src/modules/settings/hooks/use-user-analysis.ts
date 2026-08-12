"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";

export interface UserAnalysisResponse {
  markdown: string | null;
  updatedAt: string | null;
  wordCount: number | null;
}

export interface RegenerateResponse {
  runId: string;
  status: "started";
}

export function useUserAnalysis() {
  return useQuery({
    queryKey: queryKeys.settings.userAnalysis(),
    queryFn: () => apiFetch<UserAnalysisResponse>(API_ROUTES.userAnalysis),
  });
}

export function useRegenerateUserAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<RegenerateResponse>(API_ROUTES.userAnalysis, { method: "POST" }),
    onSuccess: () => {
      // The file is not written until the agent completes; the tab watches
      // the returned runId separately and invalidates once done.
      qc.invalidateQueries({ queryKey: queryKeys.runs.all });
    },
  });
}
