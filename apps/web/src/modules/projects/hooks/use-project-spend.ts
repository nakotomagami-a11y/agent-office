"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/fetch";
import { POLL } from "@/lib/polling";
import { API_ROUTES } from "@agent-office/api-contract";

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
        API_ROUTES.projectSpend(projectId!),
      ),
    enabled: !!projectId,
    // Driven by the app-wide SSE "spend:changed" event; slow reconnect safety net.
    refetchInterval: POLL.SAFETY_NET,
  });
}
