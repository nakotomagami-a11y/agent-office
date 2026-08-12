"use client";

/**
 * Spend trend — the page's anchor chart.
 *
 * Hand-rolled SVG rather than a chart library: the whole visual language
 * here is thin hairlines, mono tick labels and token-driven colour, and
 * every off-the-shelf library arrives with its own opinions about tooltips,
 * fonts and axis chrome that have to be fought back. This is ~120 lines and
 * owes nothing to the bundle.
 *
 * Renders cost as a filled area with a crisp top stroke, a soft horizontal
 * gridline set, and a hover rail that reports the exact bucket.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { SeriesPoint } from "../hooks/use-analytics-page";
import { usd, shortDay, compact, duration } from "../format/format";

export type SpendTrendProps = {
  series: SeriesPoint[];
  granularity: "day" | "week";
  /** Which measure to plot. */
  metric: "cost" | "runs" | "runtimeMs";
};

const H = 190;
const PAD_T = 14;
const PAD_B = 26;
const PAD_L = 46;
const PAD_R = 8;

export function SpendTrend({ series, granularity, metric }: SpendTrendProps) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Match the viewBox width to the real pixel width so the SVG maps 1:1 and
  // `preserveAspectRatio="none"` doesn't stretch the tick labels sideways.
  const [W, setW] = useState(800);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width ?? 0;
      if (w > 0) setW(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const vals = series.map((p) => p[metric]);
  const max = Math.max(...vals, 1);
  const ticks = useMemo(() => niceTicks(max, 4), [max]);
  const top = ticks[ticks.length - 1] ?? max;

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const x = (i: number) =>
    series.length <= 1 ? PAD_L + plotW / 2 : PAD_L + (i / (series.length - 1)) * plotW;
  const y = (v: number) => PAD_T + plotH - (v / top) * plotH;

  const line = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[metric]).toFixed(1)}`).join(" ");
  const area = series.length
    ? `${line} L${x(series.length - 1).toFixed(1)},${PAD_T + plotH} L${x(0).toFixed(1)},${PAD_T + plotH} Z`
    : "";

  const fmt = (v: number) =>
    metric === "cost" ? usd(v) : metric === "runs" ? compact(v) : duration(v);

  // Label density: never more than ~8 ticks on the x axis.
  const labelEvery = Math.max(1, Math.ceil(series.length / 8));
  const hovered = hover != null ? series[hover] : null;

  if (series.length === 0) {
    return (
      <div className="h-[190px] flex items-center justify-center text-[12px] text-txt-2">
        No runs in this window.
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full block h-[190px]"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${metric} trend, ${series.length} ${granularity} buckets`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="an-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--an-line)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--an-line)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* gridlines + y labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--line)"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            <text
              x={PAD_L - 8}
              y={y(t) + 3.5}
              textAnchor="end"
              className="fill-[var(--an-muted)] font-mono text-[9.5px] font-medium"
            >
              {fmt(t)}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#an-area)" />
        <path d={line} fill="none" stroke="var(--an-line)" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />

        {/* hover rail + point */}
        {hover != null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD_T}
              y2={PAD_T + plotH}
              stroke="var(--an-line)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.7}
            />
            <circle cx={x(hover)} cy={y(series[hover]![metric])} r={3.5} fill="var(--bg-1)" stroke="var(--an-line)" strokeWidth={2} />
          </g>
        )}

        {/* x labels */}
        {series.map((p, i) =>
          i % labelEvery === 0 || i === series.length - 1 ? (
            <text
              key={p.key}
              x={x(i)}
              y={H - 8}
              textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"}
              className="fill-[var(--an-muted)] font-mono text-[9.5px] font-medium"
            >
              {shortDay(p.key)}
            </text>
          ) : null,
        )}

        {/* invisible hit targets */}
        {series.map((p, i) => (
          <rect
            key={`hit-${p.key}`}
            x={x(i) - plotW / Math.max(series.length - 1, 1) / 2}
            y={PAD_T}
            width={plotW / Math.max(series.length - 1, 1)}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      {hovered && hover != null && (
        <div
          className="absolute -top-1 -translate-x-1/2 flex items-center gap-[8px] px-[9px] py-[5px] rounded-[7px] bg-bg-1 border border-line-2 shadow-2 font-mono text-[10.5px] whitespace-nowrap pointer-events-none"
          // `left` tracks the hovered bucket, so it is necessarily per-datum.
          style={{ left: `${((x(hover) - PAD_L) / plotW) * 100}%` }}
        >
          <span className="text-txt font-semibold">{fmt(hovered[metric])}</span>
          <span className="text-txt-2">·</span>
          <span className="text-txt-2">
            {granularity === "week" ? `week of ${shortDay(hovered.key)}` : shortDay(hovered.key)}
          </span>
        </div>
      )}
    </div>
  );
}

/** Round axis maxima to 1/2/5×10ⁿ so the labels read cleanly. */
function niceTicks(max: number, count: number): number[] {
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = step; v <= max * 1.0001 + step * 0.5; v += step) out.push(v);
  return out;
}
