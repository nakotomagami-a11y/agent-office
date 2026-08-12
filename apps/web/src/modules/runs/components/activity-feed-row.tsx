import { Icon } from "@/components/ui/icon";
import type { PersistedRun } from "@agent-office/domain/types";
import type { UnitSelection } from "@/components/ui/unit-sprite-registry";
import { formatAgentDisplayName } from "@/lib/agent-display-name";
import { cn } from "@/lib/cn";
import { formatDuration, formatRelative } from "../format/format-run-meta";
import { fmtTok } from "../format/activity-formatters";
import { ActivityFeedRowAvatar } from "./activity-feed-row-avatar";
import { ActivityFeedRowCost } from "./activity-feed-row-cost";
import { ActivityFeedRowActions } from "./activity-feed-row-actions";
import { ActivityFeedRowDetail } from "./activity-feed-row-detail";

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

  return (
    <>
      <div
        className={cn("act-row group grid items-center bg-bg-1 border border-line cursor-pointer relative gap-[12px] px-[14px] py-[11px] rounded-[10px] mb-[5px] transition-[background,border-color] duration-[100ms] [box-shadow:var(--shadow-1)] hover:bg-[var(--bg-2)] hover:border-[var(--line-2)]", isOpen && "open")}
        style={{ gridTemplateColumns: "28px minmax(0,1fr) 100px auto auto auto 18px" }}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onToggle()}
      >
        <ActivityFeedRowAvatar run={run} unitByAgent={unitByAgent} />

        <div className="min-w-0">
          <div className="flex items-center font-semibold text-txt gap-[7px] text-[13px]">
            <span>{formatAgentDisplayName(run.agentName)}</span>
            <span className="text-txt-3 bg-bg-2 border border-line font-normal font-[var(--font-mono)] text-[10px] rounded-[4px] px-[5px] py-[1px]">{run.model || "default"}</span>
          </div>
          <div className="text-txt-3 whitespace-nowrap overflow-hidden text-ellipsis font-[var(--font-mono)] text-[11.5px] mt-[2px]">{run.prompt}</div>
        </div>

        <ActivityFeedRowCost cost={run.cost} maxCost={maxCost} />

        <span className="text-txt-2 whitespace-nowrap font-[var(--font-mono)] text-[11.5px]">{formatDuration(run.durMs)}</span>
        <span className="text-txt-3 whitespace-nowrap font-[var(--font-mono)] text-[11.5px]">{fmtTok(tokens)} tok</span>
        <span className="text-txt-3 whitespace-nowrap font-[var(--font-mono)] text-[11.5px]">{formatRelative(run.ts)}</span>

        <span className={cn("text-txt-4 transition-transform duration-[180ms]", isOpen && "text-[var(--acc)] rotate-180")}>
          <Icon name="chevron-down" size={14} />
        </span>

        <ActivityFeedRowActions run={run} />
      </div>

      {isOpen && <ActivityFeedRowDetail run={run} />}
    </>
  );
}
