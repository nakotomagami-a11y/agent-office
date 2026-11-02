"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/fetch";
import { POLL } from "@/lib/polling";
import { queryKeys } from "@/lib/api/query-keys";
import { API_ROUTES } from "@agent-office/api-contract";
import type { ProjectActivity } from "@agent-office/domain/types";

export function useProjectActivity(projectId: string, opts: { start: number; bucketMs: number; count: number }) {
  const params = new URLSearchParams({ start: String(opts.start), bucketMs: String(opts.bucketMs), count: String(opts.count) });
  return useQuery({
    queryKey: queryKeys.runs.activity(projectId, opts),
    queryFn: () => apiFetch<ProjectActivity>(`${API_ROUTES.projectActivity(projectId)}?${params.toString()}`),
    // Freshness comes from the app-wide SSE "runs:changed" event; this is the reconnect safety net.
    refetchInterval: POLL.SAFETY_NET,
  });
}
