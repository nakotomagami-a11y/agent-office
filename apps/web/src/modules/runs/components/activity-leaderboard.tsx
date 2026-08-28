import { useMemo } from "react";
import type { PersistedRun } from "@agent-office/domain/types";
import type { UnitSelection } from "@/components/ui/unit-sprite-registry";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { formatAgentDisplayName } from "@/lib/agent-display-name";
import { cn } from "@/lib/cn";
import { buildLeaderboard } from "../derive/activity-leaderboard";
import { formatCost } from "../format/format-run-meta";
import { fmtTok } from "../format/activity-formatters";

const RANK_STYLE = [
  "bg-amber-soft text-amber",
  "bg-card-3 text-txt-2",
  "bg-card-3 text-txt-3",
];

export function ActivityLeaderboard({
  runs,
  unitByAgent,
}: {
  runs: PersistedRun[];
  unitByAgent: Map<string, UnitSelection>;
}) {
  const rows = useMemo(() => buildLeaderboard(runs), [runs]);

  return (
    <div className="basis-[280px] flex-1 flex flex-col gap-[10px] rounded-[16px] surface-sheen shadow-[var(--lift)] px-[16px] py-[16px]">
      <div className="flex items-center gap-[8px]">
        <span className="font-semibold text-txt text-[14px]">Top of the day</span>
        <span className="flex-1" />
        <span className="font-mono text-[10px] text-txt-4">by runs</span>
      </div>

      {rows.length === 0 ? (
        <div className="py-[16px] text-center text-txt-4 font-mono text-[11.5px]">No runs yet today.</div>
      ) : (
        <div className="flex flex-col gap-[8px]">
          {rows.map((row, i) => (
            <div
              key={row.agentId}
              className={cn(
                "flex items-center gap-[10px] px-[10px] py-[9px] rounded-[12px]",
                i === 0 ? "bg-amber-soft ring-1 ring-inset ring-amber" : "bg-card-2",
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center w-[20px] h-[20px] rounded-[6px] font-mono text-[11px] font-extrabold shrink-0",
                  RANK_STYLE[i] ?? RANK_STYLE[2],
                )}
              >
                {i + 1}
              </span>
              <AgentAvatar
                unit={unitByAgent.get(row.agentId) ?? unitForAgent(row.agentName)}
                size={28}
                label={row.agentName}
                className="rounded-[7px] border border-edge shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-txt text-[12.5px] truncate">
                  {formatAgentDisplayName(row.agentName)}
                </div>
                <div className="font-mono text-[10.5px] text-txt-4 truncate">
                  {formatCost(row.cost)} · {fmtTok(row.tokens)} tok
                </div>
              </div>
              <span
                className={cn(
                  "font-mono text-[13px] font-extrabold shrink-0",
                  i === 0 ? "text-amber" : "text-txt-3",
                )}
              >
                {row.runs}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
