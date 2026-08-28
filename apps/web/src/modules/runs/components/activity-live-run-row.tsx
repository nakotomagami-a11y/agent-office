import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import type { PersistedRun } from "@agent-office/domain/types";
import { useOfficeStore } from "@/modules/office/hooks/use-office-store";
import type { UnitSelection } from "@/components/ui/unit-sprite-registry";
import { formatAgentDisplayName } from "@/lib/agent-display-name";
import { RunAvatar } from "./run-avatar";
import { ActivityLiveRunMeta } from "./activity-live-run-meta";

export function ActivityLiveRunRow({
  run,
  unitByAgent,
}: {
  run: PersistedRun;
  unitByAgent: Map<string, UnitSelection>;
}) {
  const selectAgent = useOfficeStore((s) => s.select);
  return (
    <div className="act-live-run">
      <RunAvatar
        run={run}
        unitByAgent={unitByAgent}
        size={28}
        className="shrink-0 rounded-[8px] border border-edge bg-card-3"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center font-semibold text-txt gap-[8px] text-[13px]">
          <span className="rounded-full w-[6px] h-[6px] bg-green shadow-[0_0_6px_var(--green)] animate-pulse" />
          {formatAgentDisplayName(run.agentName)}
        </div>
        <div className="text-txt-3 whitespace-nowrap overflow-hidden text-ellipsis font-mono text-[11.5px] mt-[2px]">{run.prompt}</div>
      </div>
      <ActivityLiveRunMeta run={run} />
      <Button
        variant="ghost"
        size="sm"
        title="Open conversation"
        onClick={() => selectAgent(run.agentId, { tab: "conversation", instanceId: run.instanceId ?? null })}
      >
        <Icon name="terminal" size={12} />
      </Button>
    </div>
  );
}
