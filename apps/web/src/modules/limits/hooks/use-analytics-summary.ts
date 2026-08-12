"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";

export interface AnalyticsSummary {
  totalRuns: number;
  totalTokens: number;
  totalCost: number;
  byModel: Array<{ model: string; runs: number; tokens: number; cost: number }>;
  byAgent: Array<{ agentId: string; agentName: string; runs: number; cost: number }>;
  /** Present only when `days` was requested. */
  dailySpend?: Array<{ day: string; spend: number }>;
}

export interface UseAnalyticsSummaryOpts {
  /** Inclusive lower bound, epoch ms. */
  start: number;
  /** Exclusive upper bound, epoch ms. `Infinity` for all-time. */
  end: number;
  /** Also fetch per-day spend for the trailing N days. */
  days?: number;
  projectId?: string;
  enabled?: boolean;
}

export function useAnalyticsSummary({
  start,
  end,
  days,
  projectId,
  enabled = true,
}: UseAnalyticsSummaryOpts) {
  const params = new URLSearchParams({ start: String(start) });
  // Infinity can't survive a query string — omitting `end` tells the API
  // to use its no-upper-bound sentinel.
  if (Number.isFinite(end)) params.set("end", String(end));
  if (days !== undefined) params.set("days", String(days));
  if (projectId) params.set("project", projectId);

  return useQuery({
    queryKey: queryKeys.analytics.summary({ start, end, days, projectId }),
    queryFn: () =>
      apiFetch<AnalyticsSummary>(`${API_ROUTES.analyticsSummary}?${params.toString()}`),
    enabled,
  });
}
