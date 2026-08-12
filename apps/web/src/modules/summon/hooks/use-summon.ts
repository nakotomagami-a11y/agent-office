"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { SummonRequest } from "@agent-office/domain/types";

export interface SummonResponse {
  runId: string;
  warning?: string;
}

export function useSummon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: SummonRequest) =>
      apiFetch<SummonResponse>(API_ROUTES.summon, { method: "POST", body: req }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.runs.all });
      qc.invalidateQueries({ queryKey: queryKeys.agents.prompts(vars.agentId) });
    },
  });
}

export function useAbortRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      apiFetch<{ aborted: boolean }>(API_ROUTES.runAbort(runId), { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.runs.all });
    },
  });
}
