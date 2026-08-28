import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";
import type { StatTile } from "../derive/activity-tiles";

export function ActivityStatTile({ tile }: { tile: StatTile }) {
  return (
    <div className="flex-1 min-w-[190px] flex flex-col gap-[10px] rounded-[16px] surface-sheen shadow-[var(--lift)] px-[16px] py-[14px]">
      <div className="flex items-center gap-[9px]">
        <div
          className="flex items-center justify-center w-[26px] h-[26px] rounded-[8px] shrink-0"
          style={{ background: `color-mix(in oklab, ${tile.color} 18%, transparent)`, color: tile.color }}
        >
          <Icon name={tile.icon} size={14} />
        </div>
        <span className="font-mono text-[9.5px] font-extrabold tracking-[0.09em] uppercase text-txt-4">
          {tile.label}
        </span>
      </div>
      <div className="font-extrabold text-txt text-[22px] tracking-[-0.02em]">
        {tile.value}
        {tile.unit && <span className="text-txt-4 font-medium text-[11px] ml-[4px] font-mono">{tile.unit}</span>}
      </div>
      <div
        className={cn(
          "font-mono text-[10.5px]",
          tile.delta.cls === "neg" ? "text-red" : tile.delta.cls === "flat" ? "text-txt-4" : "text-green",
        )}
      >
        {tile.delta.text}
      </div>
    </div>
  );
}
