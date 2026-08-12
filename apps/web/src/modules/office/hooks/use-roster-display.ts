"use client";

import { useMemo } from "react";
import type { OfficeAgent } from "./use-office-agents";
import type { AgentInstance, PersistedRun } from "@agent-office/domain/types";
import { statusFromRunsForInstance } from "@/modules/office/derive/derive-status";
import type { RosterGroupData } from "@/components/layout/roster-group";

export type RosterRow = {
  key: string;
  agent: OfficeAgent;
  instance: AgentInstance | null;
  displayName: string;
};

type Project = {
  meta: {
    name: string;
    roster: AgentInstance[];
  };
};

export function useRosterDisplay(params: {
  agents: OfficeAgent[];
  runs: PersistedRun[];
  project: Project | undefined;
  expandedGroups: Record<string, string[]>;
  activeProjectId: string | null;
}): {
  rosterRows: RosterRow[];
  rosterGroups: RosterGroupData[];
} {
  const { agents, runs, project, expandedGroups, activeProjectId } = params;

  const rosterRows = useMemo<RosterRow[]>(() => {
    if (!project) {
      return agents.map((a) => ({
        key: a.id,
        agent: a,
        instance: null,
        displayName: a.name,
      }));
    }
    const agentsById = new Map(agents.map((a) => [a.id, a] as const));
    const seenSameAgent = new Map<string, number>();
    const rows: RosterRow[] = [];
    for (const inst of project.meta.roster) {
      const a = agentsById.get(inst.agentId);
      if (!a) continue;
      const count = (seenSameAgent.get(inst.agentId) ?? 0) + 1;
      seenSameAgent.set(inst.agentId, count);
      const totalForAgent = project.meta.roster.filter((i) => i.agentId === inst.agentId).length;
      const displayName = inst.label
        ? inst.label
        : totalForAgent > 1
          ? `${a.name} #${count}`
          : a.name;
      rows.push({ key: inst.instanceId, agent: a, instance: inst, displayName });
    }
    return rows;
  }, [agents, project]);

  const rosterGroups = useMemo<RosterGroupData[]>(() => {
    if (!project) return [];
    const agentsById = new Map(agents.map((a) => [a.id, a] as const));
    const seen = new Map<string, RosterGroupData>();
    const order: string[] = [];

    for (const inst of project.meta.roster) {
      const a = agentsById.get(inst.agentId);
      if (!a) continue;
      if (!seen.has(inst.agentId)) {
        seen.set(inst.agentId, {
          agentId: inst.agentId,
          agent: a,
          instances: [],
          instanceStatuses: [],
          expanded: (expandedGroups[activeProjectId ?? ""] ?? []).includes(inst.agentId),
        });
        order.push(inst.agentId);
      }
      const group = seen.get(inst.agentId)!;
      group.instances.push(inst);
      group.instanceStatuses.push(statusFromRunsForInstance(inst.instanceId, runs).status);
    }

    return order.map((id) => seen.get(id)!);
  }, [agents, runs, project, expandedGroups, activeProjectId]);

  return { rosterRows, rosterGroups };
}
