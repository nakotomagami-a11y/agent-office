"use client";

/**
 * When the agents actually run — 7 rows (day of week) × 24 columns (hour).
 *
 * This is the one view that turns 2,000 rows of `started_at` into something
 * you can read at a glance: it exposes working rhythm, which is invisible in
 * any total. Flexbox rather than CSS grid, per the house rule — each row is
 * a flex line of equal-basis cells.
 *
 * Intensity is scaled against a high percentile rather than the max: one
 * runaway hour would otherwise flatten every other cell to near-invisible.
 */

import { useMemo, useState } from "react";
import type { ActivityCell } from "../hooks/use-analytics-page";
import { cn } from "@/lib/cn";
import { usd, DOW_LABELS } from "../format/format";

export type ActivityHeatmapProps = {
  cells: ActivityCell[];
  metric: "runs" | "cost";
};

const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Bucket a cell into one of the six `.an-heat-*` steps.
 *
 * Quantised rather than a continuous ramp for two reasons: a continuous
 * value can only be expressed as a per-cell inline style, and the legend
 * underneath advertises discrete steps — so a smooth scale would make it
 * a lie.
 */
function heatStep(v: number, scaleMax: number): number {
  if (v <= 0) return 0;
  const t = Math.min(1, v / scaleMax);
  return Math.min(5, Math.max(1, Math.ceil(t * 5)));
}

export function ActivityHeatmap({ cells, metric }: ActivityHeatmapProps) {
  const [hover, setHover] = useState<{ dow: number; hour: number } | null>(null);

  const { grid, scaleMax } = useMemo(() => {
    // 7×24 dense grid, zero-filled.
    const g: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
    for (const c of cells) {
      if (c.dow >= 0 && c.dow < 7 && c.hour >= 0 && c.hour < 24) {
        g[c.dow]![c.hour] = metric === "runs" ? c.runs : c.cost;
      }
    }
    const flat = g.flat().filter((v) => v > 0).sort((a, b) => a - b);
    // 92nd percentile keeps a single outlier hour from washing out the rest.
    const p92 = flat.length ? flat[Math.floor(flat.length * 0.92)] ?? flat[flat.length - 1]! : 1;
    return { grid: g, scaleMax: Math.max(p92 as number, 1e-6) };
  }, [cells, metric]);

  const peak = useMemo(() => {
    let best = { dow: 0, hour: 0, v: 0 };
    grid.forEach((row, d) =>
      row.forEach((v, h) => {
        if (v > best.v) best = { dow: d, hour: h, v };
      }),
    );
    return best;
  }, [grid]);

  const hoveredValue = hover ? grid[hover.dow]![hover.hour]! : 0;

  return (
    <div className="flex flex-col gap-[10px]">
      {/* hour ruler */}
      <div className="flex items-center gap-[6px] pl-[18px]">
        <div className="flex-1 flex gap-[2px]">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="flex-1 text-center">
              {h % 6 === 0 && (
                <span className="font-mono text-[8.5px] text-[var(--an-muted)] tabular-nums">
                  {String(h).padStart(2, "0")}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {grid.map((row, dow) => (
        <div key={dow} className="flex items-center gap-[6px]">
          <span className="w-[12px] shrink-0 font-mono text-[9.5px] text-[var(--an-muted)] text-center">
            {DOW_LABELS[dow]}
          </span>
          <div className="flex-1 flex gap-[2px]">
            {row.map((v, hour) => {
              const isHover = hover?.dow === dow && hover?.hour === hour;
              return (
                <div
                  key={hour}
                  className={cn(
                    "flex-1 h-[16px] rounded-[3px] transition-transform duration-100",
                    `an-heat-${heatStep(v, scaleMax)}`,
                    isHover && "scale-[1.35] ring-[1.5px] ring-[var(--an-line)]",
                  )}
                  onMouseEnter={() => setHover({ dow, hour })}
                  onMouseLeave={() => setHover(null)}
                  title={`${DOW_FULL[dow]} ${String(hour).padStart(2, "0")}:00 — ${
                    metric === "runs" ? `${v} runs` : usd(v)
                  }`}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* footer: hover readout on the left, legend on the right */}
      <div className="flex items-center gap-[10px] pl-[18px] pt-[2px] min-h-[16px]">
        <span className="font-mono text-[10px] text-[var(--an-muted)]">
          {hover ? (
            <>
              <span className="text-txt">
                {metric === "runs" ? `${hoveredValue} runs` : usd(hoveredValue)}
              </span>{" "}
              · {DOW_FULL[hover.dow]} {String(hover.hour).padStart(2, "0")}:00
            </>
          ) : peak.v > 0 ? (
            <>
              peak <span className="text-txt">{DOW_FULL[peak.dow]} {String(peak.hour).padStart(2, "0")}:00</span>
            </>
          ) : (
            "no activity in this window"
          )}
        </span>
        <div className="ml-auto flex items-center gap-[5px]">
          <span className="font-mono text-[9px] text-[var(--an-muted)]">less</span>
          {[0, 1, 2, 3, 4, 5].map((step) => (
            <div key={step} className={`w-[10px] h-[10px] rounded-[2px] an-heat-${step}`} />
          ))}
          <span className="font-mono text-[9px] text-[var(--an-muted)]">more</span>
        </div>
      </div>
    </div>
  );
}
