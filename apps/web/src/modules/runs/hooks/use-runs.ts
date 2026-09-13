"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { PersistedRun } from "@agent-office/domain/types";
import { POLL } from "@/lib/polling";

export function useRuns(filters?: {
  agentId?: string;
  projectId?: string;
  instanceId?: string;
  limit?: number;
}) {
  const limit = filters?.limit ?? 100;
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (filters?.agentId) params.set("agent", filters.agentId);
  if (filters?.projectId) params.set("project", filters.projectId);
  if (filters?.instanceId) params.set("instance", filters.instanceId);
  return useQuery({
    queryKey: queryKeys.runs.list(filters),
    queryFn: () => apiFetch<PersistedRun[]>(`${API_ROUTES.runs}?${params.toString()}`),
    // Freshness comes from the app-wide SSE "runs:changed" event (app-events.tsx);
    // this slow interval is just a reconnect safety net.
    refetchInterval: POLL.SAFETY_NET,
  });
}

export function useRun(runId: string | null) {
  return useQuery({
    queryKey: queryKeys.runs.detail(runId ?? "__none"),
    queryFn: () => apiFetch<PersistedRun>(API_ROUTES.run(runId!)),
    enabled: !!runId,
  });
}
