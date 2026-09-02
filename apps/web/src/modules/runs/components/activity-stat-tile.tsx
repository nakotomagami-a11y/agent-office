import { cn } from "@/lib/cn";
import type { StatTile } from "../derive/activity-tiles";

/**
 * Icon+label used to sit stacked above value/delta (icon inline with the tiny
 * caps label) — fine at 26px, but broke down once the artistic icons needed
 * to render at 50px+ to actually read as art instead of a smudge: the label
 * row got lopsided (a big icon next to one line of tiny text) and the value/
 * delta below it had no relationship to the now much taller icon. Switched to
 * a horizontal split — icon vertically centered on the left spanning the
 * whole card, label/value/delta stacked in a column to its right — matching
 * the "medallion" stat-card layout in the V3 mockup
 * (`Activity Page V3.dc.html`'s `.medallions` block), which was designed
 * around exactly this icon-left/text-right shape.
 */
export function ActivityStatTile({ tile }: { tile: StatTile }) {
  return (
    <div className="flex-1 min-w-[190px] flex items-center gap-[14px] rounded-[16px] surface-sheen shadow-[var(--lift)] px-[16px] py-[14px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={tile.icon.src} alt={tile.icon.alt} width={52} height={52} className="shrink-0 object-contain" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="font-mono text-[9.5px] font-extrabold tracking-[0.09em] uppercase text-txt-4 truncate">
          {tile.label}
        </div>
        <div className="font-extrabold text-txt text-[20px] tracking-[-0.02em] truncate">
          {tile.value}
          {tile.unit && <span className="text-txt-4 font-medium text-[11px] ml-[4px] font-mono">{tile.unit}</span>}
        </div>
        <div
          className={cn(
            "font-mono text-[10.5px] truncate",
            tile.delta.cls === "neg" ? "text-red" : tile.delta.cls === "flat" ? "text-txt-4" : "text-green",
          )}
        >
          {tile.delta.text}
        </div>
      </div>
    </div>
  );
}
