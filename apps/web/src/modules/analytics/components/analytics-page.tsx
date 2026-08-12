"use client";

/**
 * `/analytics` — workspace usage, spend and reliability.
 *
 * Reading order is deliberate: the hero answers "how much, and is that
 * unusual"; the trend answers "what shape"; the two middle panels answer
 * "where did it go"; and the tail panels answer "on what, and when".
 *
 * All layout is Flexbox (house rule). Charts are bespoke SVG — see
 * `spend-trend.tsx` for why there's no chart dependency.
 */

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/ui/icon";
import { useAnalyticsPage } from "../hooks/use-analytics-page";
import { HeroBand } from "./hero-band";
import { SpendTrend } from "./spend-trend";
import { ModelSplit } from "./model-split";
import { AgentTable } from "./agent-table";
import { RankBars } from "./rank-bars";
import { ActivityHeatmap } from "./activity-heatmap";
import { Panel } from "./panel";
import { usd, compact, duration, toolLabel } from "../format/format";

type Period = "week" | "month" | "quarter" | "all";
type TrendMetric = "cost" | "runs" | "runtimeMs";

const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "7 days" },
  { id: "month", label: "30 days" },
  { id: "quarter", label: "90 days" },
  { id: "all", label: "All time" },
];

const TREND_METRICS: { id: TrendMetric; label: string }[] = [
  { id: "cost", label: "Spend" },
  { id: "runs", label: "Runs" },
  { id: "runtimeMs", label: "Runtime" },
];

const DAY = 86_400_000;

function rangeFor(p: Period): { start: number; end: number } {
  const end = Date.now();
  if (p === "all") return { start: 0, end: Number.POSITIVE_INFINITY };
  const days = p === "week" ? 7 : p === "month" ? 30 : 90;
  return { start: end - days * DAY, end };
}

function periodLabel(p: Period): string {
  return p === "all" ? "all time" : p === "week" ? "last 7 days" : p === "month" ? "last 30 days" : "last 90 days";
}

export function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [metric, setMetric] = useState<TrendMetric>("cost");

  const { start, end } = useMemo(() => rangeFor(period), [period]);
  const q = useAnalyticsPage({ start, end });
  const d = q.data;

  const header = (
    <PageHeader
      title="Analytics"
      sub="· usage, spend & reliability"
      actions={
        <SegControl
          options={PERIODS.map((p) => ({ id: p.id, label: p.label }))}
          value={period}
          onChange={(v) => setPeriod(v as Period)}
          ariaLabel="Time window"
        />
      }
    />
  );

  if (q.isLoading || !d) {
    return (
      <>
        {header}
        <div className="flex-1 min-h-0 overflow-y-auto px-[28px] pt-[20px] pb-[48px] flex flex-col gap-[16px]">
          <Skeleton width="100%" height={112} />
          <Skeleton width="100%" height={250} />
          <div className="flex gap-[16px] flex-wrap">
            <Skeleton width="49%" height={260} />
            <Skeleton width="49%" height={260} />
          </div>
        </div>
      </>
    );
  }

  const projectItems = d.byProject.map((p) => ({
    key: p.projectId,
    label: p.projectId,
    value: p.cost,
    display: usd(p.cost),
    meta: `${compact(p.runs)} runs · ${duration(p.runtimeMs)}`,
  }));

  const toolItems = d.byTool.map((t) => ({
    key: t.name,
    label: toolLabel(t.name),
    value: t.calls,
    display: compact(t.calls),
    meta: `${compact(t.runs)} runs`,
  }));

  const totalToolCalls = d.byTool.reduce((s, t) => s + t.calls, 0);

  return (
    <>
      {header}
      <div className="flex-1 min-h-0 overflow-y-auto px-[28px] pt-[20px] pb-[48px] flex flex-col gap-[16px] [&>*]:shrink-0">
        <HeroBand
          totals={d.totals}
          previous={d.previous}
          hasPrevious={d.hasPrevious}
          periodLabel={periodLabel(period)}
        />

        <Panel
          title="Trend"
          sub={d.seriesGranularity === "week" ? "by week" : "by day"}
          right={
            <SegControl
              options={TREND_METRICS.map((m) => ({ id: m.id, label: m.label }))}
              value={metric}
              onChange={(v) => setMetric(v as TrendMetric)}
              ariaLabel="Trend metric"
              size="sm"
            />
          }
        >
          <SpendTrend series={d.series} granularity={d.seriesGranularity} metric={metric} />
        </Panel>

        {/* Models is full-width rather than paired with Agents. Pairing a
            3-row panel against a 10-row one is exactly what produced the
            ~400px void in the old modal — a panel should be as tall as its
            own content, never as tall as its neighbour. */}
        <Panel title="Models" sub="share of spend">
          <ModelSplit rows={d.byModel} totalCost={d.totals.cost} />
        </Panel>

        <div className="flex gap-[16px] flex-wrap items-start">
          <div className="flex flex-col min-w-[380px] flex-[3_1_440px]">
            <Panel title="Agents" sub="by spend">
              <AgentTable rows={d.byAgent} />
            </Panel>
          </div>
          <div className="flex flex-col min-w-[290px] flex-[2_1_300px]">
            <Panel title="Projects" sub="by spend">
              <RankBars items={projectItems} empty="No project-scoped runs yet." />
            </Panel>
          </div>
          <div className="flex flex-col min-w-[290px] flex-[2_1_300px]">
            <Panel
              title="Tools"
              sub={totalToolCalls > 0 ? `${compact(totalToolCalls)} calls` : undefined}
            >
              <RankBars items={toolItems} tint="tool" empty="No tool calls recorded." />
            </Panel>
          </div>
        </div>

        <Panel title="Activity" sub="runs by hour, local time">
          <ActivityHeatmap cells={d.activity} metric="runs" />
        </Panel>

        <p className="m-0 flex items-start gap-[7px] font-mono text-[10.5px] text-[var(--an-muted)] leading-[1.6] px-[2px]">
          <Icon name="shield" size={12} className="shrink-0 mt-[2px]" />
          <span>
            Counts only what Agent Office summoned, from{" "}
            <code className="text-txt-2">~/.claude/agent-office/db.sqlite</code>. Runs you started
            with plain <code className="text-txt-2">claude</code> aren&apos;t included. Nothing here
            leaves this machine.
          </span>
        </p>
      </div>
    </>
  );
}

/* ── segmented control ───────────────────────────────────────────────── */

function SegControl({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-[2px] p-[3px] bg-bg-2 border border-line rounded-[9px]"
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={active}
            className={`whitespace-nowrap rounded-[6px] border-none cursor-pointer transition-[background,color] duration-[120ms] ${
              size === "sm" ? "px-[9px] py-[4px] text-[11.5px]" : "px-[11px] py-[5px] text-[12.5px]"
            } ${
              active
                ? "bg-bg-1 text-txt font-semibold shadow-1"
                : "bg-transparent text-[var(--an-muted)] hover:text-txt"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
