"use client";

import { useState } from "react";
import type { ActivityCounts } from "@agent-office/domain/types";
import { formatCost } from "@/modules/runs/format/format-run-meta";
import { useIntervalTick } from "@/modules/runs/hooks/use-interval-tick";
import { useProjectActivity } from "../hooks/use-project-activity";
import {
  ACTIVITY_RANGES,
  activityAxis,
  activityWindow,
  slotAgo,
  slotLabel,
  type ActivityRangeKey,
} from "../format/activity-range";

type Metric = "runs" | "spend" | "success";

const METRIC_COLOR: Record<Metric, string> = { runs: "var(--acc)", spend: "var(--cyan)", success: "var(--red)" };
const LEGEND: Record<Metric, string> = { runs: "runs", spend: "spend", success: "failures" };
const EMPTY: ActivityCounts = { runs: 0, errors: 0, cost: 0 };

const num = (n: number) => n.toLocaleString("en-US");
const successRate = (c: ActivityCounts) => `${Math.round((1 - c.errors / c.runs) * 1000) / 10}%`;

function delta(current: number, prior: number, priorLabel: string, upIsGood: boolean): { text: string; color: string } {
  if (prior <= 0) return { text: `none in prior ${priorLabel}`, color: "var(--txt-4)" };
  const pct = ((current - prior) / prior) * 100;
  if (pct === 0) return { text: `same as prior ${priorLabel}`, color: "var(--txt-4)" };
  const good = pct > 0 === upIsGood;
  return {
    text: `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}% vs prior ${priorLabel}`,
    color: good ? "var(--green)" : "var(--red)",
  };
}

export function ProjectActivityCard({ projectId }: { projectId: string }) {
  const [rangeKey, setRangeKey] = useState<ActivityRangeKey>("24h");
  const [metric, setMetric] = useState<Metric>("runs");
  const [hover, setHover] = useState<number | null>(null);
  useIntervalTick(true, 60_000);

  const now = Date.now();
  const win = activityWindow(rangeKey, now);
  const { data } = useProjectActivity(projectId, { start: win.start, bucketMs: win.bucketMs, count: win.count });
  const range = ACTIVITY_RANGES[rangeKey];
  const buckets = data?.buckets.length === win.count ? data.buckets : Array.from({ length: win.count }, () => EMPTY);
  const totals = data?.totals;

  const isH = hover !== null && hover <= win.nowIndex;
  const hovered = isH ? buckets[hover] ?? EMPTY : null;
  const series = buckets.map((b) => (metric === "runs" ? b.runs : metric === "spend" ? b.cost : b.errors));
  const max = Math.max(0, ...series.slice(0, win.nowIndex + 1)) || 1;
  const color = METRIC_COLOR[metric];

  const runsDelta = totals && data ? delta(totals.runs, data.previous.runs, range.label, true) : null;
  const spendDelta = totals && data ? delta(totals.cost, data.previous.cost, range.label, false) : null;
  const stats: Array<{ key: Metric; label: string; value: string; sub: string; subColor: string; hint: string }> = [
    {
      key: "runs",
      label: "Total runs",
      value: hovered ? num(hovered.runs) : totals ? num(totals.runs) : "—",
      sub: hovered
        ? `${((hovered.runs / Math.max(totals?.runs ?? 0, 1)) * 100).toFixed(1)}% of the ${range.period}`
        : runsDelta?.text ?? "",
      subColor: hovered ? "var(--txt-4)" : runsDelta?.color ?? "var(--txt-4)",
      hint: "Show runs over time",
    },
    {
      key: "spend",
      label: range.spendLabel,
      value: hovered ? formatCost(hovered.cost) : totals ? formatCost(totals.cost) : "—",
      sub: hovered ? `${formatCost(hovered.cost / Math.max(hovered.runs, 1))} per run` : spendDelta?.text ?? "",
      subColor: hovered ? "var(--txt-4)" : spendDelta?.color ?? "var(--txt-4)",
      hint: "Show spend over time",
    },
    {
      key: "success",
      label: "Success rate",
      value: hovered ? (hovered.runs ? successRate(hovered) : "—") : totals?.runs ? successRate(totals) : "—",
      sub: hovered
        ? `${num(hovered.errors)} failed of ${num(hovered.runs)}`
        : totals ? `${num(totals.errors)} failed of ${num(totals.runs)}` : "",
      subColor: "var(--txt-4)",
      hint: "Show failures over time",
    },
  ];

  const pct = isH ? ((hover + 0.5) / win.count) * 100 : 0;

  return (
    <div className="flex-[2.2_1_0%] min-w-[min(560px,100%)] rounded-[22px] surface-sheen shadow-[var(--lift)] pt-[20px] px-[22px] pb-[16px] flex flex-col gap-[18px]">
      <div className="flex items-center gap-[12px]">
        <span className="text-[16px] font-bold whitespace-nowrap">Activity</span>
        <div role="group" aria-label="Activity range" className="flex items-center gap-[2px] p-[3px] rounded-[11px] bg-card-2 border border-edge">
          {(Object.keys(ACTIVITY_RANGES) as ActivityRangeKey[]).map((k) => {
            const on = k === rangeKey;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setRangeKey(k);
                  setHover(null);
                }}
                className={`px-[10px] py-[4px] rounded-[8px] text-[11.5px] font-semibold cursor-pointer whitespace-nowrap transition-all duration-[140ms] ease-[ease] hover:text-txt ${on ? "text-txt" : "text-txt-4"}`}
                style={{
                  background: on ? "var(--card)" : "transparent",
                  boxShadow: on ? "var(--inset-hi), 0 4px 10px -6px rgba(0,0,0,.8)" : "none",
                }}
              >
                {ACTIVITY_RANGES[k].label}
              </button>
            );
          })}
        </div>
        <span className="font-mono text-[11px] font-semibold text-acc whitespace-nowrap">{isH ? slotLabel(win, hover) : ""}</span>
        <span className="flex-1" />
        <span className="flex items-center gap-[12px] font-mono text-[10.5px] text-txt-4">
          <span className="flex items-center gap-[6px]">
            <span className="w-[8px] h-[8px] rounded-[2px]" style={{ background: color }} />
            {LEGEND[metric]}
          </span>
          <span className="flex items-center gap-[6px]">
            <span className="w-[5px] h-[5px] rounded-full bg-red" />
            failed
          </span>
        </span>
      </div>

      <div className="flex gap-[6px] -mx-[10px]">
        {stats.map((st) => {
          const sel = metric === st.key;
          return (
            <button
              key={st.key}
              type="button"
              aria-pressed={sel}
              title={st.hint}
              onClick={() => setMetric(st.key)}
              className="flex-1 min-w-0 flex flex-col gap-[4px] py-[8px] px-[10px] rounded-[12px] cursor-pointer text-left transition-[background,box-shadow] duration-[160ms] ease-[ease] hover:bg-card-2"
              style={{
                background: sel ? "var(--card-2)" : undefined,
                boxShadow: sel ? "inset 0 0 0 1px var(--edge-2)" : "none",
              }}
            >
              <span className="flex items-center gap-[7px] text-[12px] font-semibold text-txt-3 whitespace-nowrap">
                <span
                  className="w-[8px] h-[8px] rounded-[2px] transition-opacity duration-[160ms] ease-[ease]"
                  style={{ background: METRIC_COLOR[st.key], opacity: sel ? 1 : 0.35 }}
                />
                {st.label}
              </span>
              <span className="text-[26px] font-extrabold tracking-[-0.035em] leading-[1.1] whitespace-nowrap">{st.value}</span>
              <span
                className="font-mono text-[10.5px] whitespace-nowrap overflow-hidden text-ellipsis"
                style={{ color: st.subColor }}
              >
                {st.sub || "\u00a0"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-[8px]">
        <div className="relative flex items-stretch gap-[3px] h-[72px]" onMouseLeave={() => setHover(null)}>
          {buckets.map((b, i) => {
            const fut = i > win.nowIndex;
            const on = isH && hover === i;
            const lit = on || (!isH && i === win.nowIndex);
            return (
              <span
                key={i}
                onMouseEnter={() => setHover(fut ? null : i)}
                className="relative flex-1 flex flex-col justify-end gap-[3px] h-full transition-opacity duration-[140ms] ease-[ease]"
                style={{ opacity: isH && !on && !fut ? 0.45 : 1 }}
              >
                {rangeKey === "24h" && i === win.nowIndex && (
                  <span className="absolute left-1/2 top-[-4px] bottom-0 w-px bg-acc opacity-[.45]" />
                )}
                {!fut && b.errors > 0 && metric !== "success" && (
                  <span className="w-[4px] h-[4px] rounded-full bg-red self-center shrink-0" />
                )}
                <span
                  className="min-h-[4px] rounded-[3px]"
                  style={{
                    transition: "height 260ms cubic-bezier(.2,.8,.2,1), background 140ms ease, opacity 140ms ease",
                    height: fut ? "4px" : `${Math.max(6, Math.round((series[i]! / max) * 100))}%`,
                    background: fut ? "var(--an-cell-empty)" : lit ? color : metric === "runs" ? "var(--an-cell)" : color,
                    opacity: fut || lit ? 1 : 0.5,
                  }}
                />
              </span>
            );
          })}
          {isH && hovered && (
            <div
              className="absolute bottom-[calc(100%+12px)] pointer-events-none z-20 w-[200px] py-[11px] px-[12px] rounded-[13px] bg-card-3 border border-edge-2 shadow-[0_20px_44px_-18px_rgba(0,0,0,.95)] flex flex-col gap-[9px]"
              style={{
                left: `${pct}%`,
                transform: pct < 18 ? "translateX(-12%)" : pct > 82 ? "translateX(-88%)" : "translateX(-50%)",
              }}
            >
              <div className="flex items-baseline gap-[8px]">
                <span className="font-mono text-[11.5px] font-bold text-txt">{slotLabel(win, hover)}</span>
                <span className="flex-1" />
                <span className="font-mono text-[10px] text-txt-4">{slotAgo(win, hover)}</span>
              </div>
              <div className="flex flex-col gap-[5px]">
                {[
                  { label: "Runs", value: num(hovered.runs), swatch: "var(--acc)", color: "var(--txt)", bold: metric === "runs" },
                  {
                    label: "Failed",
                    value: num(hovered.errors),
                    swatch: "var(--red)",
                    color: hovered.errors ? "var(--red)" : "var(--txt-3)",
                    bold: metric === "success",
                  },
                  { label: "Spend", value: formatCost(hovered.cost), swatch: "var(--cyan)", color: "var(--txt)", bold: metric === "spend" },
                ].map((r) => (
                  <div key={r.label} className="flex items-center gap-[8px] text-[12px]">
                    <span className="w-[7px] h-[7px] rounded-[2px]" style={{ background: r.swatch }} />
                    <span className="text-txt-3">{r.label}</span>
                    <span className="flex-1" />
                    <span className="font-mono" style={{ fontWeight: r.bold ? 700 : 500, color: r.color }}>
                      {r.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-between font-mono text-[10px] text-txt-4">
          {activityAxis(win, now).map((ax) => (
            <span key={ax.label} className={ax.now ? "text-acc" : undefined}>
              {ax.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
