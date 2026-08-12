"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";

export interface AnalyticsTotals {
  runs: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  runtimeMs: number;
  done: number;
  errors: number;
}

export interface ModelFamilyRow {
  family: string;
  label: string;
  runs: number;
  tokens: number;
  cost: number;
  variants: string[];
}

export interface AgentRow {
  agentId: string;
  agentName: string;
  runs: number;
  cost: number;
  runtimeMs: number;
  errors: number;
}

export interface ProjectRow {
  projectId: string;
  runs: number;
  cost: number;
  runtimeMs: number;
}

export interface ToolRow {
  name: string;
  calls: number;
  runs: number;
}

export interface ActivityCell {
  dow: number;
  hour: number;
  runs: number;
  cost: number;
}

export interface SeriesPoint {
  key: string;
  cost: number;
  runs: number;
  runtimeMs: number;
}

export interface AnalyticsPageData {
  totals: AnalyticsTotals;
  previous: AnalyticsTotals;
  hasPrevious: boolean;
  byModel: ModelFamilyRow[];
  byAgent: AgentRow[];
  byProject: ProjectRow[];
  byTool: ToolRow[];
  activity: ActivityCell[];
  series: SeriesPoint[];
  seriesGranularity: "day" | "week";
}

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
