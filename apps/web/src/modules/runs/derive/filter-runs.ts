import type { PersistedRun } from "@agent-office/domain/types";

export type ActivityScope = "today" | "week" | "month" | "all";

export interface Filters {
  query: string;
  statuses: Array<PersistedRun["status"]>;
}

export function scopeRuns(runs: PersistedRun[], scope: ActivityScope): PersistedRun[] {
  if (scope === "all") return runs;
  const cutoff =
    scope === "today"
      ? new Date().setHours(0, 0, 0, 0)
      : scope === "week"
        ? Date.now() - 7 * 86_400_000
        : Date.now() - 30 * 86_400_000;
  return runs.filter((r) => r.ts >= cutoff);
}

export function filterRuns(runs: PersistedRun[], filters: Filters): PersistedRun[] {
  return runs.filter((r) => {
    if (filters.statuses.length > 0 && !filters.statuses.includes(r.status)) {
      return false;
    }
    if (filters.query) {
      const blob = `${r.agentName} ${r.prompt} ${r.id}`.toLowerCase();
      if (!blob.includes(filters.query.toLowerCase())) return false;
    }
    return true;
  });
}
