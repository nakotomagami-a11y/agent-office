"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { POLL } from "@/lib/polling";

export interface ProjectSpendData {
  byInstance: Record<string, number>;
  total: number;
}

/**
 * Fetches per-instance spend for a project from `GET /api/projects/[id]/spend`.
 * The `byInstance` object is keyed `"agentId|instanceId"`.
 * Returns null data when `projectId` is null (query disabled).
 */
export function useProjectSpend(projectId: string | null) {
  return useQuery({
    queryKey: ["projects", "spend", projectId ?? "__none"],
    queryFn: () =>
      apiFetch<ProjectSpendData>(
        `/api/projects/${encodeURIComponent(projectId!)}/spend`,
      ),
    enabled: !!projectId,
    refetchInterval: POLL.RUNS,
  });
}
