"use client";

/**
 * Where the money goes, by model family.
 *
 * The point of this panel is the *ratio*, not the totals: on a typical
 * workspace Opus and Sonnet do a similar number of runs while Opus takes
 * 4-5x the spend. So the stacked bar shows share-of-cost, and each row
 * leads with $/run — the number that actually explains the bar.
 */

import type { ModelFamilyRow } from "../hooks/use-analytics-page";
import { usd, usdPrecise, compact, modelFillClass } from "../format/format";

export type ModelSplitProps = { rows: ModelFamilyRow[]; totalCost: number };

export function ModelSplit({ rows, totalCost }: ModelSplitProps) {
  if (rows.length === 0) {
    return <p className="m-0 text-[12px] text-txt-2 py-[10px]">No runs in this window.</p>;
  }

  // Guard the callout against tiny samples — a 3-run model would otherwise
  // top the $/run ranking on noise alone.
  const ranked = rows.filter((r) => r.runs >= 10);
  const costliest = ranked.length
    ? ranked.reduce((a, b) => (b.cost / b.runs > a.cost / a.runs ? b : a))
    : null;

  return (
    <div className="flex flex-col gap-[14px]">
      {/* share-of-cost bar */}
      <div className="flex h-[10px] rounded-full overflow-hidden bg-bg-2 border border-line">
        {rows.map((r) => {
          const share = totalCost > 0 ? (r.cost / totalCost) * 100 : 0;
          if (share <= 0) return null;
          return (
            <div
              key={r.family}
              className={modelFillClass(r.family)}
              // Width is the one genuinely per-datum value here; a class per
              // possible percentage isn't expressible.
              style={{ width: `${share}%` }}
              title={`${r.label} · ${usd(r.cost)} · ${share.toFixed(1)}%`}
            />
          );
        })}
      </div>

      {/* Cards rather than full-width rows: at page width a row layout left
          ~600px of dead space between the model name and its figures. Two
          to four models tile cleanly and each block stays scannable. */}
      <div className="flex flex-wrap gap-[10px] [&>*]:basis-[calc(33.333%-7px)] [&>*]:shrink-0 max-[900px]:[&>*]:basis-[calc(50%-5px)] max-[560px]:[&>*]:basis-full">
        {rows.map((r) => {
          const share = totalCost > 0 ? (r.cost / totalCost) * 100 : 0;
          const perRun = r.runs > 0 ? r.cost / r.runs : 0;
          return (
            <div
              key={r.family}
              className="min-w-0 flex flex-col gap-[10px] px-[14px] py-[12px] rounded-md bg-bg-2 border border-line"
            >
              <div className="flex items-center gap-[8px] min-w-0">
                <span
                  className={`w-[8px] h-[8px] rounded-full shrink-0 ${modelFillClass(r.family)}`}
                  aria-hidden
                />
                <span className="text-[13px] font-semibold text-txt truncate leading-none">
                  {r.label}
                </span>
                <span className="ml-auto font-mono text-[10.5px] text-[var(--an-muted)] tabular-nums shrink-0">
                  {share.toFixed(0)}%
                </span>
              </div>

              <div className="flex items-baseline gap-[7px]">
                <span className="text-[22px] font-bold text-txt tabular-nums leading-none">
                  {usd(r.cost)}
                </span>
              </div>

              <div className="flex items-center gap-[12px] font-mono text-[10.5px] text-[var(--an-muted)] min-w-0">
                <span className="truncate">
                  <span className="text-txt-2">{usdPrecise(perRun)}</span> / run
                </span>
                <span className="truncate">
                  <span className="text-txt-2">{compact(r.runs)}</span> runs
                </span>
                <span className="ml-auto text-[var(--an-muted)] truncate shrink-0">
                  {r.variants.length > 1 ? `${r.variants.length} variants` : r.variants[0]}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {costliest && ranked.length > 1 && (
        <p className="m-0 font-mono text-[10.5px] text-[var(--an-muted)] leading-[1.5]">
          <span className="text-txt-2">{costliest.label}</span> is the priciest per run at{" "}
          <span className="text-txt-2">
            {usdPrecise(costliest.cost / Math.max(costliest.runs, 1))}
          </span>
          .
        </p>
      )}
    </div>
  );
}
