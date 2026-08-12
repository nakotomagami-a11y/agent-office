"use client";

/**
 * Generic ranked horizontal bar list — used for both projects (by spend) and
 * tools (by call count).
 *
 * The bar is drawn *behind* the label rather than beside it. That keeps the
 * row compact, lets the label run full width, and reads as a single object
 * instead of the label/track/number triplet that stock dashboards produce.
 */

import type { ReactNode } from "react";

export type RankBarItem = {
  key: string;
  label: string;
  /** Drives the bar width. */
  value: number;
  /** Right-aligned primary readout. */
  display: string;
  /** Optional muted second line. */
  meta?: string;
};

export type RankBarsProps = {
  items: RankBarItem[];
  /** Colour variant — maps to the `.an-rank-*` classes in globals.css. */
  tint?: "acc" | "tool";
  empty?: ReactNode;
};

export function RankBars({ items, tint = "acc", empty }: RankBarsProps) {
  if (items.length === 0) {
    return (
      <p className="m-0 text-[12px] text-txt-2 py-[10px]">
        {empty ?? "Nothing in this window."}
      </p>
    );
  }
  const max = Math.max(...items.map((i) => i.value), 1e-6);

  return (
    <div className="flex flex-col gap-[3px]">
      {items.map((it) => (
        <div
          key={it.key}
          className={`an-rank-${tint} relative flex items-center gap-[10px] px-[10px] py-[7px] rounded-[6px] overflow-hidden group`}
        >
          {/* fill sits behind the content */}
          {/* Wash sits behind the label; width is the per-datum value. */}
          <div
            className="an-rank-wash absolute inset-y-0 left-0 rounded-[6px] transition-[width] duration-300"
            style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }}
            aria-hidden
          />
          <div className="an-rank-rule absolute inset-y-0 left-0 w-[2px] rounded-l-[6px]" aria-hidden />

          <span className="relative z-[1] text-[12.5px] text-txt truncate flex-1 min-w-0">
            {it.label}
          </span>
          {it.meta && (
            <span className="relative z-[1] font-mono text-[10px] text-[var(--an-muted)] shrink-0 tabular-nums">
              {it.meta}
            </span>
          )}
          <span className="relative z-[1] font-mono text-[12px] font-semibold text-txt tabular-nums shrink-0">
            {it.display}
          </span>
        </div>
      ))}
    </div>
  );
}
