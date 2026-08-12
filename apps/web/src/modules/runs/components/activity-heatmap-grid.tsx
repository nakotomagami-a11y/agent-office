import { cn } from "@/lib/cn";
import { classifyHeatmapLevel } from "../format/activity-stats";

export function ActivityHeatmapGrid({
  grid,
  max,
  dayLabels,
  nowDay,
  nowHour,
}: {
  grid: number[][];
  max: number;
  dayLabels: string[];
  nowDay: number;
  nowHour: number;
}) {
  return (
    <div className="act-heatmap-scroll overflow-x-auto">
      <div className="act-heatmap-grid flex flex-col gap-[2px]">
        {grid.map((row, d) => (
          <div key={d} className="flex items-center gap-[2px]">
            <div className="text-txt-3 text-right font-[var(--font-mono)] text-[9.5px] pr-[4px] w-[26px] shrink-0">{dayLabels[d]}</div>
            {row.map((v, h) => {
              const lvl = classifyHeatmapLevel(v, max);
              return (
                <div
                  key={h}
                  className={cn(
                    "hcell bg-bg-3 border border-line cursor-pointer relative h-[16px] rounded-[2px] transition-transform duration-[100ms] hover:scale-[1.2] hover:z-[2] hover:[box-shadow:var(--shadow-1)] flex-1 basis-0 min-w-0",
                    lvl === "l4" ? "bg-[var(--acc)] border-[var(--acc)]" : lvl,
                    d === nowDay && h === nowHour && "outline outline-2 outline-[var(--txt)] outline-offset-[1px]",
                  )}
                  title={`${dayLabels[d]} ${String(h).padStart(2, "0")}:00 - ${v} run${v === 1 ? "" : "s"}`}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="act-heatmap-foot flex items-center gap-[2px] mt-[4px]">
        <div className="w-[26px] shrink-0" />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="text-txt-4 text-center font-[var(--font-mono)] text-[9px] flex-1 basis-0 min-w-0">
            {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
