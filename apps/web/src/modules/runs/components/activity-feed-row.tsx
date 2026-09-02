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
          "act-row group flex items-center gap-[13px] surface-sheen shadow-[var(--lift)] cursor-pointer relative px-[16px] py-[13px] rounded-[18px] mb-[5px] transition-transform duration-150 hover:-translate-y-[2px]",
          isOpen && "open",
        )}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onToggle()}
      >
        <ActivityFeedRowAvatar run={run} unitByAgent={unitByAgent} />
        <div className="min-w-0 flex-1 flex flex-col gap-[8px]">
          <div className="flex items-center gap-[8px]">
            <span className="font-semibold text-txt text-[13px] whitespace-nowrap">{formatAgentDisplayName(run.agentName)}</span>
            <span className="text-txt-4 bg-card-2 border border-edge font-normal font-mono text-[9.5px] rounded-[6px] px-[7px] py-[2px] whitespace-nowrap">
              {run.model || "default"}
            </span>
            <span className={cn("font-mono text-[9px] font-extrabold tracking-[0.06em] rounded-full px-[8px] py-[2px] whitespace-nowrap", badge.cls)}>
              {badge.label}
            </span>
            <span className="flex-1" />
            <ActivityFeedRowActions run={run} />
            <span className="text-txt-4 whitespace-nowrap font-mono text-[10px] shrink-0">{formatRelative(run.ts)}</span>
            <span className={cn("text-txt-4 transition-transform duration-150 shrink-0", isOpen && "text-acc rotate-180")}>
              <Icon name="chevron" size={12} />
            </span>
          </div>

          <div className="text-txt-3 whitespace-nowrap overflow-hidden text-ellipsis font-mono text-[12px]">
            {run.prompt}
          </div>

          <div className="flex items-center gap-[14px] font-mono text-[10px]">
            <span className="flex items-center gap-[5px] text-amber whitespace-nowrap shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/coin.png" alt="" width={14} height={14} className="shrink-0 object-contain" /> {formatCost(run.cost)}
            </span>
            <span className="flex items-center gap-[5px] text-cyan whitespace-nowrap shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/mana.png" alt="" width={14} height={14} className="shrink-0 object-contain" /> {fmtTok(tokens)} tok
            </span>
            <span className="flex items-center gap-[5px] text-txt-4 whitespace-nowrap shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/clock.png" alt="" width={14} height={14} className="shrink-0 object-contain" /> {formatDuration(run.durMs)}
            </span>
            <ActivityFeedRowCost cost={run.cost} maxCost={maxCost} />
            <span className="font-bold text-acc shrink-0">+{xpForRun(run)} xp</span>
          </div>
        </div>
      </div>

      {isOpen && <ActivityFeedRowDetail run={run} />}
    </>
  );
}
