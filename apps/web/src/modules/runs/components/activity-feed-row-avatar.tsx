import type { PersistedRun } from "@agent-office/domain/types";
import type { UnitSelection } from "@/components/ui/unit-sprite-registry";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { RunAvatar } from "./run-avatar";

export function ActivityFeedRowAvatar({
  run,
  unitByAgent,
}: {
  run: PersistedRun;
  unitByAgent: Map<string, UnitSelection>;
}) {
  return (
    <div className="relative shrink-0 w-[32px] h-[32px]">
      <RunAvatar
        run={run}
        unitByAgent={unitByAgent}
        size={32}
        className="rounded-[8px] border border-edge bg-card-2"
      />
      <span
        className={cn(
          "absolute flex items-center justify-center rounded-full bottom-[-3px] right-[-3px] w-[14px] h-[14px] ring-2 ring-card text-white",
          run.status === "error" ? "bg-red" : run.status === "running" ? "bg-acc animate-pulse" : "bg-green",
        )}
      >
        {run.status === "done" && <Icon name="check" size={8} />}
        {run.status === "error" && <Icon name="x" size={8} />}
      </span>
    </div>
  );
}
