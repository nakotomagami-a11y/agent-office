import { useState, useMemo } from "react";
import type { PersistedRun } from "@agent-office/domain/types";
import { useRuns } from "./use-runs";
import { groupRunsByDay } from "../format/format-run-meta";
import {
  scopeRuns,
  filterRuns,
  type ActivityScope,
  type Filters,
} from "../derive/filter-runs";

function exportRuns(runs: PersistedRun[]) {
  const blob = new Blob([JSON.stringify(runs, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `activity-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useActivityFeed(agentId?: string, projectId?: string) {
  const [scope, setScope] = useState<ActivityScope>("week");
  const [filters, setFilters] = useState<Filters>({ query: "", statuses: [] });
  const [openId, setOpenId] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const { data: allRuns = [], isLoading } = useRuns({ agentId, projectId, limit: 500 });

  const scopedRuns = useMemo(() => scopeRuns(allRuns, scope), [allRuns, scope]);
  const liveRuns = useMemo(
    () => allRuns.filter((r) => r.status === "running"),
    [allRuns],
  );
  const filtered = useMemo(() => filterRuns(scopedRuns, filters), [scopedRuns, filters]);
  const groups = useMemo(() => groupRunsByDay(filtered), [filtered]);
  const maxCost = useMemo(
    () => Math.max(0.001, ...filtered.map((r) => r.cost)),
    [filtered],
  );

  const toggleOpen = (id: string) => setOpenId((cur) => (cur === id ? null : id));
  const toggleDay = (day: string) =>
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });

  return {
    scope,
    setScope,
    filters,
    setFilters,
    openId,
    toggleOpen,
    expandedDays,
    toggleDay,
    allRuns,
    liveRuns,
    groups,
    maxCost,
    filtered,
    isLoading,
    handleExport: () => exportRuns(filtered),
  };
}
