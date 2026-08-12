import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
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
    <div
      className="act-live-run"
      style={{ gridTemplateColumns: "30px minmax(0,1fr) auto auto auto auto auto" }}
    >
      <RunAvatar
        run={run}
        unitByAgent={unitByAgent}
        size={28}
        className="shrink-0 rounded-[6px] border border-line bg-bg-3"
      />
      <div className="min-w-0">
        <div className="flex items-center font-semibold text-txt gap-[8px] text-[13px]">
          <span className="rounded-full w-[6px] h-[6px]" style={{ background: "var(--working)", boxShadow: "0 0 6px var(--working)", animation: "pulseDot 1s infinite" }} />
          {formatAgentDisplayName(run.agentName)}
        </div>
        <div className="text-txt-2 whitespace-nowrap overflow-hidden text-ellipsis font-[var(--font-mono)] text-[11.5px] mt-[2px]">{run.prompt}</div>
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
      <Button href={PAGE_ROUTES.run(run.id)} variant="ghost" size="sm" title="Open run">
        <Icon name="chevron" size={12} />
      </Button>
    </div>
  );
}
