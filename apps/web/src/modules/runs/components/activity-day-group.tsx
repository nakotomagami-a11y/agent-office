import type { UnitSelection } from "@/components/ui/unit-sprite-registry";
import type { RunsByDay } from "../format/format-run-meta";
import { ActivityDayHeader } from "./activity-day-header";
import { ActivityFeedRow } from "./activity-feed-row";

export function ActivityDayGroup({
  group,
  expanded,
  onToggleDay,
  openId,
  onToggleOpen,
  maxCost,
  unitByAgent,
}: {
  group: RunsByDay;
  expanded: boolean;
  onToggleDay: () => void;
  openId: string | null;
  onToggleOpen: (id: string) => void;
  maxCost: number;
  unitByAgent: Map<string, UnitSelection>;
}) {
  const rows = expanded ? group.runs : group.runs.slice(0, 10);

  return (
    <div>
      <ActivityDayHeader group={group} />
      {rows.map((r) => (
        <ActivityFeedRow
          key={r.id}
          run={r}
          isOpen={openId === r.id}
          onToggle={() => onToggleOpen(r.id)}
          maxCost={maxCost}
          unitByAgent={unitByAgent}
        />
      ))}
      {group.runs.length > 10 && (
        <button
          type="button"
          className="w-full text-center text-txt-3 bg-bg-1 border border-line rounded-[10px] px-[14px] py-[9px] mb-[5px] text-[12px] font-[var(--font-mono)] hover:text-[var(--txt)] hover:border-[var(--line-2)] hover:bg-[var(--bg-2)]"
          onClick={onToggleDay}
        >
          {expanded ? "Show less" : `Show ${group.runs.length - 10} more`}
        </button>
      )}
    </div>
  );
}
