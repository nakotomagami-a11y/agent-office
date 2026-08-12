import type { PersistedRun } from "@agent-office/domain/types";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { unitForAgent, type UnitSelection } from "@/components/ui/unit-sprite-registry";

export function RunAvatar({
  run,
  unitByAgent,
  size,
  className,
}: {
  run: PersistedRun;
  unitByAgent: Map<string, UnitSelection>;
  size: number;
  className?: string;
}) {
  return (
    <AgentAvatar
      unit={unitByAgent.get(run.agentId) ?? unitForAgent(run.agentName)}
      size={size}
      label={run.agentName}
      className={className}
    />
  );
}
