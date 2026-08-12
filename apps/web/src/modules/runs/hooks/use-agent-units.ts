import { useMemo } from "react";
import { useAgents } from "@/modules/agents/hooks/use-agents";
import { unitForAgent, type UnitSelection } from "@/components/ui/unit-sprite-registry";

/** Maps agentId → the Tiny Swords avatar the agent is actually configured
 *  with, so run rows show the same face as everywhere else instead of a
 *  generic two-letter initial. Falls back to the same name-hash used
 *  elsewhere when the agent record isn't loaded yet (or was deleted). */
export function useAgentUnits(): Map<string, UnitSelection> {
  const { data: agents } = useAgents();
  return useMemo(() => {
    const m = new Map<string, UnitSelection>();
    for (const a of agents ?? []) m.set(a.name, unitForAgent(a.name, a.unit));
    return m;
  }, [agents]);
}
