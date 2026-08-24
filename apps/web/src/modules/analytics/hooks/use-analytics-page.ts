"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";

// Contracts live in @agent-office/domain/types; re-exported so the analytics
// components can keep importing them from this hook. `AnalyticsPageData` is the
// page payload (domain `AnalyticsPage`); the generic row names are analytics-
// prefixed in the shared types to avoid collisions, aliased back here.
import type {
  AnalyticsPage as AnalyticsPageData,
  AnalyticsTotals,
  ModelFamilyRow,
  ToolRow,
  ActivityCell,
  SeriesPoint,
  AnalyticsAgentRow as AgentRow,
  AnalyticsProjectRow as ProjectRow,
} from "@agent-office/domain/types";
export type {
  AnalyticsPageData,
  AnalyticsTotals,
  ModelFamilyRow,
  ToolRow,
  ActivityCell,
  SeriesPoint,
  AgentRow,
  ProjectRow,
};

export interface UseAnalyticsPageOpts {
  start: number;
  end: number;
  projectId?: string;
}

export function useAnalyticsPage({ start, end, projectId }: UseAnalyticsPageOpts) {
  const params = new URLSearchParams({ start: String(start) });
  // Infinity can't survive a query string — omitting `end` means "no bound".
  if (Number.isFinite(end)) params.set("end", String(end));
  if (projectId) params.set("project", projectId);

  return useQuery({
    queryKey: queryKeys.analytics.page({ start, end, projectId }),
    queryFn: () => apiFetch<AnalyticsPageData>(`${API_ROUTES.analyticsPage}?${params.toString()}`),
    staleTime: 30_000,
  });
}
