import { cn } from "@/lib/cn";
import type { StatTile } from "../derive/activity-tiles";
import { ActivitySpark } from "./activity-spark";

export function ActivityStatTile({ tile }: { tile: StatTile }) {
  return (
    <div className="bg-bg-1 border border-line relative overflow-hidden flex flex-col px-[16px] py-[14px] rounded-[12px] gap-[5px] min-h-[106px] [box-shadow:var(--shadow-1)]">
      <div className="text-txt-3 uppercase font-[var(--font-mono)] text-[10px] tracking-[0.1em]">{tile.label}</div>
      <div className="font-bold text-txt text-[24px] tracking-[-0.01em]">
        {tile.value}
        {tile.unit && <span className="text-txt-3 font-medium text-[12px] ml-[3px] font-[var(--font-mono)]">{tile.unit}</span>}
      </div>
      <div className={cn("inline-flex items-center gap-[4px] font-[var(--font-mono)] text-[10.5px]", tile.delta.cls === "neg" ? "text-[var(--error)]" : tile.delta.cls === "flat" ? "text-txt-3" : "text-[var(--working)]")}>
        {tile.delta.text}
      </div>
      <div className="absolute right-[12px] bottom-[12px] w-[70px] h-[34px]">
        <ActivitySpark data={tile.spark} color={tile.color} />
      </div>
    </div>
  );
}
