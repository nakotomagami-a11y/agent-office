"use client";

/**
 * The answer-first strip.
 *
 * Cost is the reason anyone opens this page, so it gets the only large
 * number and the only period-over-period delta. Runs / runtime / success /
 * $-per-run are supporting facts and sit on one hairline-separated rail
 * beside it — not in co-equal tinted boxes, which flatten the hierarchy and
 * imply that "tokens" matters as much as "spend".
 */

import { cn } from "@/lib/cn";
import type { AnalyticsTotals } from "../hooks/use-analytics-page";
import { usd, usdPrecise, compact, duration, delta } from "../format/format";

export type HeroBandProps = {
  totals: AnalyticsTotals;
  previous: AnalyticsTotals;
  hasPrevious: boolean;
  periodLabel: string;
};

export function HeroBand({ totals, previous, hasPrevious, periodLabel }: HeroBandProps) {
  const costDelta = delta(totals.cost, previous.cost);
  const settled = totals.done + totals.errors;
  const successRate = settled > 0 ? (totals.done / settled) * 100 : null;
  const perRun = totals.runs > 0 ? totals.cost / totals.runs : 0;

  return (
    <section className="flex flex-wrap items-stretch gap-x-[34px] gap-y-[18px] px-[22px] py-[20px] bg-bg-1 border border-line rounded-lg">
      {/* headline */}
      <div className="flex flex-col justify-center gap-[8px] min-w-[190px]">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--an-muted)]">
          Spend · {periodLabel}
        </span>
        <div className="flex items-baseline gap-[10px] flex-wrap">
          <span className="text-[38px] font-bold text-txt tabular-nums leading-none tracking-[-0.02em]">
            {usd(totals.cost)}
          </span>
          {/* Up is amber, down is green — for spend, falling is good. */}
          {hasPrevious && (
            <span
              className={cn(
                "inline-flex items-baseline gap-[4px] font-mono text-[12px] font-semibold",
                costDelta.dir === "up" && "text-[var(--status-up)]",
                costDelta.dir === "down" && "text-[var(--status-down)]",
                costDelta.dir === "flat" && "text-[var(--an-muted)]",
              )}
              title={`Previous period: ${usd(previous.cost)}`}
            >
              {costDelta.text}
            </span>
          )}
        </div>
        {hasPrevious && (
          <span className="font-mono text-[10.5px] text-[var(--an-muted)]">
            vs {usd(previous.cost)} previous
          </span>
        )}
      </div>

      {/* Supporting rail. Each stat is a fixed-basis column: with only a
          flex gap, the longer uppercase labels ("agent runtime") overflowed
          their box and collided with the neighbouring stat. */}
      <div className="flex flex-wrap items-start gap-y-[16px] flex-1 min-w-[300px] pl-[26px] border-l border-line max-[760px]:pl-0 max-[760px]:border-l-0">
        <Stat label="runs" value={compact(totals.runs)} sub={hasPrevious ? delta(totals.runs, previous.runs).text : undefined} />
        <Stat label="runtime" value={duration(totals.runtimeMs)} sub={hasPrevious ? delta(totals.runtimeMs, previous.runtimeMs).text : undefined} />
        <Stat
          label="success"
          value={successRate === null ? "—" : `${successRate.toFixed(0)}%`}
          sub={settled > 0 ? `${totals.errors} failed` : undefined}
          tone={successRate !== null && successRate < 80 ? "warn" : undefined}
        />
        <Stat label="per run" value={usdPrecise(perRun)} />
        <Stat
          label="tokens"
          value={compact(totals.tokensIn + totals.tokensOut)}
          sub={`${compact(totals.tokensOut)} out`}
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warn";
}) {
  return (
    <div className="flex flex-col gap-[6px] basis-[104px] grow-0 shrink-0 pr-[12px]">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.09em] text-[var(--an-muted)] leading-none whitespace-nowrap">
        {label}
      </span>
      <span
        className={`text-[19px] font-semibold tabular-nums leading-none whitespace-nowrap ${
          tone === "warn" ? "text-status-error" : "text-txt"
        }`}
      >
        {value}
      </span>
      {sub && (
        <span className="font-mono text-[9.5px] text-[var(--an-muted)] leading-none tabular-nums whitespace-nowrap">
          {sub}
        </span>
      )}
    </div>
  );
}
