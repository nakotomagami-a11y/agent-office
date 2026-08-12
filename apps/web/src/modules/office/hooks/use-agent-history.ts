"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import type { PersistedRun } from "@agent-office/domain/types";
import { useRuns } from "@/modules/runs/hooks/use-runs";
import { deleteAgentRuns } from "@/lib/api/runs-ops";
import { formatDayLabel, runTokens } from "../derive/history-format";

export type HistoryFilter = "all" | "ok" | "bad";

export interface AgentHistoryGroup {
  day: string;
  runs: PersistedRun[];
  cost: number;
  tokens: number;
}

function matchesFilter(r: PersistedRun, filter: HistoryFilter): boolean {
  if (filter === "ok") return r.status === "done";
  if (filter === "bad") return r.status !== "done";
  return true;
}

function matchesQuery(r: PersistedRun, query: string): boolean {
  if (!query) return true;
  return `${r.agentId} ${r.prompt}`.toLowerCase().includes(query.toLowerCase());
}

function groupByDay(runs: PersistedRun[]): AgentHistoryGroup[] {
  const groups: AgentHistoryGroup[] = [];
  for (const r of runs) {
    const day = formatDayLabel(r.ts);
    let g = groups.find((x) => x.day === day);
    if (!g) {
      g = { day, runs: [], cost: 0, tokens: 0 };
      groups.push(g);
    }
    g.runs.push(r);
    g.cost += r.cost || 0;
    g.tokens += runTokens(r);
  }
  return groups;
}

export function useAgentHistory(agentId: string, instanceId: string | null, opts?: { onWiped?: () => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const qc = useQueryClient();

  // History is scoped to the selected instance. Runs are persisted with the
  // UI's instanceId (the summon route records req.instanceId), so each instance
  // shows only its own runs. No instance selected → unscoped (all agent runs).
  const runsQ = useRuns({ agentId, instanceId: instanceId ?? undefined, limit: 200 });
  const allRuns = useMemo(() => runsQ.data ?? [], [runsQ.data]);

  const wipeMutation = useMutation({
    mutationFn: () => deleteAgentRuns(agentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.runs.all });
      opts?.onWiped?.();
    },
  });

  const stats = useMemo(() => {
    const totalCost = allRuns.reduce((s, r) => s + (r.cost || 0), 0);
    const totalTokens = allRuns.reduce((s, r) => s + runTokens(r), 0);
    const successRate = allRuns.length
      ? Math.round((100 * allRuns.filter((r) => r.status === "done").length) / allRuns.length)
      : 0;
    return { totalCost, totalTokens, successRate };
  }, [allRuns]);

  const groups = useMemo(() => {
    const filtered = allRuns.filter((r) => matchesFilter(r, filter) && matchesQuery(r, query));
    return groupByDay(filtered);
  }, [allRuns, filter, query]);

  return {
    isLoading: runsQ.isLoading,
    allRuns,
    ...stats,
    groups,
    query,
    setQuery,
    filter,
    setFilter,
    wipe: () => wipeMutation.mutate(),
    isWiping: wipeMutation.isPending,
  };
}
