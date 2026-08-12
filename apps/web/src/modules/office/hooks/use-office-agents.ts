"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { ApiAgent, PersistedRun } from "@agent-office/domain/types";
import { POLL } from "@/lib/polling";
import { unitForAgent, type UnitSelection } from "@/components/ui/unit-sprite-registry";
import { shortName } from "../derive/sprite-palette";
import { statusFromRuns, type AgentStatusInfo } from "../derive/derive-status";

export interface OfficeAgent extends ApiAgent {
  id: string;
  short: string;
  /** Tiny Swords avatar selection: explicit override, else hashed from name. */
  unitChoice: UnitSelection;
  status: AgentStatusInfo["status"];
  task?: string;
  taskKind?: string;
}

interface OfficeAgentsResult {
  agents: OfficeAgent[];
  runs: PersistedRun[];
  workingCount: number;
  idleCount: number;
  errorCount: number;
  spendToday: number;
}

export function useOfficeAgents(): OfficeAgentsResult & { isLoading: boolean } {
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(),
    queryFn: () => apiFetch<ApiAgent[]>(API_ROUTES.agents),
  });

  const runsQuery = useQuery({
    queryKey: queryKeys.runs.list({ limit: 50 }),
    queryFn: () => apiFetch<PersistedRun[]>(`${API_ROUTES.runs}?limit=50`),
    refetchInterval: POLL.RUNS,
  });

  const enriched = useMemo<
    Omit<OfficeAgentsResult, "spendToday"> & { spendToday: number }
  >(() => {
    const rawAgents = agentsQuery.data ?? [];
    const rawRuns = runsQuery.data ?? [];
    const agents = rawAgents.map<OfficeAgent>((a) => {
      const status = statusFromRuns(a.name, rawRuns);
      return {
        ...a,
        id: a.name,
        short: shortName(a.name),
        unitChoice: unitForAgent(a.name, a.unit),
        status: status.status,
        task: status.task,
        taskKind: status.taskKind,
      };
    });

    let workingCount = 0;
    let idleCount = 0;
    let errorCount = 0;
    for (const a of agents) {
      if (a.status === "working" || a.status === "thinking") workingCount++;
      else if (a.status === "idle") idleCount++;
      else if (a.status === "error") errorCount++;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    let spendToday = 0;
    for (const r of rawRuns) {
      if (r.ts >= todayMs) spendToday += r.cost || 0;
    }

    return { agents, runs: rawRuns, workingCount, idleCount, errorCount, spendToday };
  }, [agentsQuery.data, runsQuery.data]);

  return { ...enriched, isLoading: agentsQuery.isLoading };
}
