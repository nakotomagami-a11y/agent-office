import { useMemo } from "react";
import type { PersistedRun } from "@agent-office/domain/types";
import {
  buildHeatmapGrid,
  findBusiestCell,
  buildHeatmapDayLabels,
} from "../format/activity-stats";
import { ActivityHeatmapGrid } from "./activity-heatmap-grid";

export function ActivityHeatmap({ runs }: { runs: PersistedRun[] }) {
  const grid = useMemo(() => buildHeatmapGrid(runs), [runs]);
  const dayLabels = useMemo(() => buildHeatmapDayLabels(), []);
  const busiest = useMemo(() => findBusiestCell(grid), [grid]);

  const max = Math.max(...grid.flat(), 1);
  const total = grid.flat().reduce((s, v) => s + v, 0);
  const nowDay = 6; // last row is today
  const nowHour = new Date().getHours();

  return (
    <div className="rounded-[16px] surface-sheen shadow-[var(--lift)] px-[18px] py-[16px]">
      <div className="flex items-center gap-[10px] mb-[14px]">
        <div>
          <span className="font-semibold text-txt text-[14px]">Campaign calendar</span>{" "}
          <span className="text-txt-4 text-[11px] font-mono">
            {total} runs · busiest {dayLabels[busiest.d]} {String(busiest.h).padStart(2, "0")}:00
          </span>
        </div>
        <div className="ml-auto flex items-center text-txt-4 gap-[6px] font-mono text-[10px]">
          less
          <div className="flex gap-[2px]">
            <div className="bg-card-3 w-[10px] h-[10px] rounded-[2px]" />
            <div className="hcell l1 w-[10px] h-[10px] rounded-[2px]" />
            <div className="hcell l2 w-[10px] h-[10px] rounded-[2px]" />
            <div className="hcell l3 w-[10px] h-[10px] rounded-[2px]" />
            <div className="hcell w-[10px] h-[10px] rounded-[2px] bg-acc" />
          </div>
          more
        </div>
      </div>

      <ActivityHeatmapGrid
        grid={grid}
        max={max}
        dayLabels={dayLabels}
        nowDay={nowDay}
        nowHour={nowHour}
      />
    </div>
  );
}
