import { Icon } from "@/components/ui/icon";
import type { PersistedRun } from "@agent-office/domain/types";
import type { UnitSelection } from "@/components/ui/unit-sprite-registry";
import { formatAgentDisplayName } from "@/lib/agent-display-name";
import { cn } from "@/lib/cn";
import { formatCost, formatDuration, formatRelative } from "../format/format-run-meta";
import { fmtTok, xpForRun } from "../format/activity-formatters";
import { ActivityFeedRowAvatar } from "./activity-feed-row-avatar";
import { ActivityFeedRowCost } from "./activity-feed-row-cost";
import { ActivityFeedRowActions } from "./activity-feed-row-actions";
import { ActivityFeedRowDetail } from "./activity-feed-row-detail";

const STATUS_BADGE: Record<PersistedRun["status"], { label: string; cls: string }> = {
  done: { label: "VICTORY", cls: "bg-green-soft text-green" },
  error: { label: "ERROR", cls: "bg-red-soft text-red" },
  running: { label: "LIVE", cls: "bg-acc-soft text-acc" },
};

export function ActivityFeedRow({
  run,
  isOpen,
  onToggle,
  maxCost,
  unitByAgent,
}: {
  run: PersistedRun;
  isOpen: boolean;
  onToggle: () => void;
  maxCost: number;
  unitByAgent: Map<string, UnitSelection>;
}) {
  const tokens = run.tokensIn + run.tokensOut;
  const badge = STATUS_BADGE[run.status];

  return (
    <>
      <div
        className={cn(
          "act-row group flex flex-col gap-[6px] bg-card-2 cursor-pointer relative px-[14px] py-[11px] rounded-[12px] mb-[5px] transition-colors duration-100 hover:bg-card-3",
          isOpen && "open",
        )}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onToggle()}
      >
        <div className="flex items-center gap-[10px]">
          <ActivityFeedRowAvatar run={run} unitByAgent={unitByAgent} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center font-semibold text-txt gap-[7px] text-[13px]">
              <span>{formatAgentDisplayName(run.agentName)}</span>
              <span className="text-txt-3 bg-card-3 font-normal font-mono text-[10px] rounded-[4px] px-[5px] py-[1px]">
                {run.model || "default"}
              </span>
              <span className={cn("font-mono text-[9.5px] font-extrabold tracking-[0.06em] rounded-[4px] px-[6px] py-[1.5px]", badge.cls)}>
                {badge.label}
              </span>
            </div>
            <div className="text-txt-3 whitespace-nowrap overflow-hidden text-ellipsis font-mono text-[11.5px] mt-[2px]">
              {run.prompt}
            </div>
          </div>
          <ActivityFeedRowActions run={run} />
          <span className="text-txt-4 whitespace-nowrap font-mono text-[11px] shrink-0">{formatRelative(run.ts)}</span>
          <span className={cn("text-txt-4 transition-transform duration-150 shrink-0", isOpen && "text-acc rotate-180")}>
            <Icon name="chevron" size={12} />
          </span>
        </div>

        <div className="flex items-center gap-[10px] pl-[42px] font-mono text-[11px] text-txt-3">
          <span>{formatCost(run.cost)}</span>
          <span>{fmtTok(tokens)} tok</span>
          <span>{formatDuration(run.durMs)}</span>
          <ActivityFeedRowCost cost={run.cost} maxCost={maxCost} />
          <span className="font-bold text-amber shrink-0">+{xpForRun(run)} xp</span>
        </div>
      </div>

      {isOpen && <ActivityFeedRowDetail run={run} />}
    </>
  );
}
