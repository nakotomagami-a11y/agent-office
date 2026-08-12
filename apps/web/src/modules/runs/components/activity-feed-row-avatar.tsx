import type { PersistedRun } from "@agent-office/domain/types";
import type { UnitSelection } from "@/components/ui/unit-sprite-registry";
import { cn } from "@/lib/cn";
import { RunAvatar } from "./run-avatar";

export function ActivityFeedRowAvatar({
  run,
  unitByAgent,
}: {
  run: PersistedRun;
  unitByAgent: Map<string, UnitSelection>;
}) {
  const dotCls =
    run.status === "error" ? "error" : run.status === "running" ? "running" : "";
  return (
    <div className="act-row-av relative shrink-0 w-[26px] h-[26px]">
      <RunAvatar
        run={run}
        unitByAgent={unitByAgent}
        size={26}
        className="rounded-[6px] border border-line bg-bg-2"
      />
      <span className={cn("absolute rounded-full bottom-[-2px] right-[-2px] w-[8px] h-[8px] [border:2px_solid_var(--bg-1)]", dotCls === "error" ? "bg-[var(--error)]" : "bg-[var(--working)]", dotCls === "running" && "animate-[pulseDot_1.2s_infinite]")} />
    </div>
  );
}
