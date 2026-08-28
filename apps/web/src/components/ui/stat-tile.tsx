import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type StatTileProps = {
  label: ReactNode;
  value: ReactNode;
  /** Delta pill, e.g. "▲ 12.4%". Provide `deltaDirection` for the color. */
  delta?: ReactNode;
  deltaDirection?: "up" | "down" | "neutral";
  /** Optional chart/sparkline slot rendered below the value — the owning
   *  page supplies its own SVG; this primitive only provides the card
   *  shell. */
  children?: ReactNode;
  className?: string;
};

const DELTA_TONE: Record<NonNullable<StatTileProps["deltaDirection"]>, string> = {
  up: "bg-green-soft text-green",
  down: "bg-red-soft text-red",
  neutral: "bg-card-3 text-txt-3",
};

/**
 * Stat card — muted label + delta pill on one row, a large number below,
 * with room for an optional sparkline. Used for "Total runs" / "Spend
 * today" / "Runs today" style tiles across the Project and Activity pages.
 */
export function StatTile({ label, value, delta, deltaDirection = "neutral", children, className }: StatTileProps) {
  return (
    <div className={cn("surface-sheen rounded-[22px] shadow-[var(--lift)] px-5 pt-[18px] pb-0 overflow-hidden flex-1", className)}>
      <div className="flex items-center gap-[10px]">
        <span className="text-[12.5px] font-semibold text-txt-3 whitespace-nowrap">{label}</span>
        <span className="flex-1" />
        {delta !== undefined ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10.5px] font-bold whitespace-nowrap shrink-0",
              DELTA_TONE[deltaDirection],
            )}
          >
            {delta}
          </span>
        ) : null}
      </div>
      <div className="text-[34px] font-extrabold tracking-[-0.035em] mt-2">{value}</div>
      {children}
    </div>
  );
}
