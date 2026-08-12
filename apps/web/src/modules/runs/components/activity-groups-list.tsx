import { Icon } from "@/components/ui/icon";
import type { UnitSelection } from "@/components/ui/unit-sprite-registry";
import type { RunsByDay } from "../format/format-run-meta";
import { ActivityDayGroup } from "./activity-day-group";

export function ActivityGroupsList({
  groups,
  isLoading,
  expandedDays,
  toggleDay,
  openId,
  toggleOpen,
  maxCost,
  unitByAgent,
}: {
  groups: RunsByDay[];
  isLoading: boolean;
  expandedDays: Set<string>;
  toggleDay: (day: string) => void;
  openId: string | null;
  toggleOpen: (id: string) => void;
  maxCost: number;
  unitByAgent: Map<string, UnitSelection>;
}) {
  if (isLoading) {
    return <div className="p-8 text-center text-txt-3 font-mono text-[13px]">loading runs…</div>;
  }
  if (groups.length === 0) {
    return (
      <div className="p-8 text-center text-txt-3 bg-bg-1 border border-line rounded-xl">
        <Icon name="search" size={24} />
        <div className="mt-2.5 text-[14px] text-txt-2">Nothing matches your filter.</div>
        <div className="mt-1 text-[12px] font-mono">Try widening the agent or status filter.</div>
      </div>
    );
  }
  return (
    <div>
      {groups.map((g) => (
        <ActivityDayGroup
          key={g.day}
          group={g}
          expanded={expandedDays.has(g.day)}
          onToggleDay={() => toggleDay(g.day)}
          openId={openId}
          onToggleOpen={toggleOpen}
          maxCost={maxCost}
          unitByAgent={unitByAgent}
        />
      ))}
    </div>
  );
}
