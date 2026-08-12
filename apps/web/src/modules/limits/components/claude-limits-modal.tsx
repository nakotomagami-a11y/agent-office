"use client";

import { useState, useEffect, useMemo } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import {
  useClaudeLimitsHydration,
  useClaudeLimitsStore,
  periodStart,
  periodEnd,
  type LimitsPeriod,
} from "@/lib/claude-limits-store";
import { useAnalyticsSummary } from "../hooks/use-analytics-summary";
import { fmtUSD, fmtTok, modelLabel, modelBarGradient } from "../format/format";

/* ------------------------------------------------------------------ */
/* Plan config                                                          */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/* Sub-components                                                       */
/* ------------------------------------------------------------------ */

function SectionHead({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[3px] h-[14px] bg-ao-accent rounded-full shrink-0" />
      <h3 className="text-[12.5px] font-semibold text-ao-fg-0 m-0">{title}</h3>
      {sub && <span className="text-[11px] text-ao-fg-3 font-mono">{sub}</span>}
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}

function LimHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--ao-line-0)] shrink-0">
      <div className="w-8 h-8 bg-ao-accent-soft border border-ao-accent-line rounded-[8px] flex items-center justify-center text-ao-accent text-[15px]" aria-hidden="true">⚡</div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-ao-fg-0">Analytics</div>
        <div className="text-[11px] text-ao-fg-3 font-mono mt-[1px]">runs, tokens, models, spend · workspace local, never sent anywhere</div>
      </div>
      <button
        className="w-7 h-7 rounded-[6px] flex items-center justify-center text-ao-fg-3 text-[16px] leading-none transition-[background,color] duration-[120ms] hover:bg-ao-bg-3 hover:text-ao-fg-0 border-0 bg-transparent cursor-pointer p-0"
        aria-label="Close"
        onClick={onClose}
      >×</button>
    </div>
  );
}

function PeriodSeg({
  value,
  onChange,
}: {
  value: LimitsPeriod;
  onChange: (p: LimitsPeriod) => void;
}) {
  const opts: { id: LimitsPeriod; label: string }[] = [
    { id: "daily",  label: "Daily"    },
    { id: "week",   label: "Weekly"   },
    { id: "month",  label: "Monthly"  },
    { id: "all",    label: "All time" },
  ];
  return (
    <div className="flex gap-0.5 bg-ao-bg-3 border border-ao-line-1 rounded-[8px] p-[3px]" role="group" aria-label="Analytics window">
      {opts.map((o) => (
        <button
          key={o.id}
          className={`flex-1 px-[10px] py-[5px] rounded-[6px] text-[12px] transition-[background,color] duration-[120ms] border-0 cursor-pointer ${value === o.id ? "bg-ao-bg-1 text-ao-fg-0 shadow-[0_1px_3px_rgba(0,0,0,0.3)]" : "bg-transparent text-ao-fg-2 hover:text-ao-fg-1"}`}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Muted sub-label under each section heading, matching the active window. */
function periodLabel(p: LimitsPeriod): string {
  if (p === "daily") return "today";
  if (p === "month") return "this month";
  if (p === "all") return "all time";
  return "this week";
}

const CHART_H = 60; // fixed pixel height for the bar area

function DailyBars({ last14 }: { last14: { label: string; spend: number }[] }) {
  const max = Math.max(...last14.map((d) => d.spend), 0.01);
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="flex gap-[3px]" style={{ height: CHART_H }} role="img" aria-label="Last 14 days of spend">
        {last14.map((d, i) => {
          const isToday = i === last14.length - 1;
          const barPx = d.spend > 0 ? Math.max(4, Math.round((d.spend / max) * CHART_H)) : 0;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col justify-end relative cursor-default group/bar"
              style={{ height: CHART_H }}
            >
              {d.spend > 0 && (
                <div className="absolute bottom-[calc(100%+4px)] left-1/2 -translate-x-1/2 hidden group-hover/bar:flex bg-ao-bg-4 border border-ao-line-2 rounded-[6px] px-[8px] py-[5px] text-[10.5px] whitespace-nowrap text-ao-fg-1 font-mono z-10 pointer-events-none gap-[4px]">
                  <span className="text-ao-fg-0">{fmtUSD(d.spend)}</span>
                  <span className="text-ao-fg-3">·</span>
                  <span>{d.label}</span>
                </div>
              )}
              {barPx > 0 ? (
                <div
                  className={`w-full rounded-[2px_2px_0_0] transition-[background] duration-[100ms] ${isToday ? "bg-ao-accent" : "bg-ao-fg-2 group-hover/bar:bg-ao-fg-0"}`}
                  style={{ height: barPx }}
                />
              ) : (
                <div className={`w-full h-[2px] ${isToday ? "bg-ao-accent opacity-30" : "bg-ao-line-2"}`} />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex text-[9.5px] text-ao-fg-3 font-mono" aria-hidden="true">
        {last14.map((d, i) => (
          <div key={i} className={`flex-1 text-center overflow-hidden ${i === last14.length - 1 ? "text-ao-accent" : ""}`}>
            {i % 2 === 0 || i === last14.length - 1 ? d.label : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function ByModel({
  modelRows,
  totalCost,
}: {
  modelRows: [string, { runs: number; tokens: number; cost: number }][];
  totalCost: number;
}) {
  if (modelRows.length === 0) {
    return <div className="text-[12px] text-ao-fg-3 py-2">No runs in this period.</div>;
  }
  return (
    <div className="bg-ao-bg-2 border border-ao-line-1 rounded-[10px] overflow-hidden">
      {modelRows.map(([id, m]) => {
        const pct = totalCost > 0 ? (m.cost / totalCost) * 100 : 0;
        const avg = m.runs > 0 ? m.cost / m.runs : 0;
        const label = modelLabel(id);
        return (
          <div key={id} className="flex flex-col gap-[10px] px-[18px] py-[16px] border-t border-[var(--ao-line-0)] first:border-t-0">
            {/* Row 1: name · pct · cost */}
            <div className="grid items-baseline gap-[14px]" style={{ gridTemplateColumns: "1fr auto auto" }}>
              <div className="flex items-baseline gap-[10px] min-w-0">
                <span className="font-bold text-[15px] text-ao-fg-0 tracking-[-0.005em]">{label.name}</span>
                <span className="font-mono text-[10.5px] text-ao-fg-3 tracking-[0.04em]">{label.sub}</span>
              </div>
              <span className="font-mono font-bold text-[14px] text-ao-fg-1 tracking-[0.02em]">{pct.toFixed(0)}%</span>
              <span className="font-mono font-bold text-[16px] text-ao-fg-0">{fmtUSD(m.cost)}</span>
            </div>

            {/* Bar */}
            <div className="h-[8px] rounded-full overflow-hidden border border-[var(--ao-line-0)]" style={{ background: "var(--ao-bg-1)" }}>
              <div className="h-full rounded-full transition-[width_.4s_ease]" style={{ width: `${pct}%`, background: modelBarGradient(id) }} />
            </div>

            {/* Meta */}
            <div className="flex gap-[18px] font-mono text-[11px] text-ao-fg-3">
              <span><span className="text-ao-fg-1">{m.runs}</span> runs</span>
              <span><span className="text-ao-fg-1">{fmtTok(m.tokens)}</span> tokens</span>
              <span><span className="text-ao-fg-1">{fmtUSD(avg, 3)}</span> / run</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TopAgents({
  agentRows,
  totalCost,
}: {
  agentRows: [string, { runs: number; cost: number; name: string }][];
  totalCost: number;
}) {
  if (agentRows.length === 0) {
    return <div className="text-[12px] text-ao-fg-3 py-2">No runs in this period.</div>;
  }
  const maxCost = agentRows[0]?.[1].cost ?? 1;
  return (
    <div className="bg-ao-bg-2 border border-ao-line-1 rounded-[10px] overflow-hidden">
      {agentRows.map(([id, a], i) => {
        const pct = totalCost > 0 ? (a.cost / totalCost) * 100 : 0;
        const barPct = Math.max(2, (a.cost / maxCost) * 100);
        const initial = (a.name || id).charAt(0).toUpperCase();
        const isTop = i === 0;
        return (
          <div
            key={id}
            className="grid items-center gap-[14px] px-[16px] py-[12px] border-t border-[var(--ao-line-0)] first:border-t-0 transition-[background_.12s]"
            style={{
              gridTemplateColumns: "24px 32px minmax(0,1fr) 1fr 70px",
              background: isTop ? "linear-gradient(90deg, var(--ao-accent-softer), transparent 50%)" : undefined,
            }}
          >
            {/* Rank */}
            <div
              className="font-mono text-[11px] text-right tracking-[0.04em]"
              style={{ color: isTop ? "var(--ao-accent)" : "var(--ao-fg-3)", fontWeight: isTop ? 700 : 400 }}
            >
              {i + 1}
            </div>

            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-[8px] flex items-center justify-center font-mono font-bold text-[13px] text-ao-fg-1 shrink-0"
              style={{
                background: "var(--ao-bg-3)",
                border: isTop ? "1px solid var(--ao-accent-line)" : "1px solid var(--ao-line-1)",
                boxShadow: isTop ? "0 0 12px var(--ao-accent-softer)" : undefined,
              }}
              aria-hidden="true"
            >
              {initial}
            </div>

            {/* Name + runs */}
            <div className="min-w-0">
              <div className="font-semibold text-[13px] text-ao-fg-0 truncate">{id}</div>
              <div className="font-mono text-[10.5px] text-ao-fg-3 mt-[2px]">{a.runs} runs</div>
            </div>

            {/* Bar + pct */}
            <div className="flex items-center gap-[8px]">
              <div className="flex-1 h-[6px] rounded-full overflow-hidden border border-[var(--ao-line-0)] min-w-0" style={{ background: "var(--ao-bg-1)" }}>
                <div
                  className="h-full rounded-full transition-[width_.4s_ease]"
                  style={{ width: `${barPct}%`, background: "linear-gradient(90deg, color-mix(in oklab, var(--ao-accent) 75%, white), var(--ao-accent))" }}
                />
              </div>
              <span className="font-mono text-[10.5px] text-ao-fg-2 w-8 text-right shrink-0">{pct.toFixed(0)}%</span>
            </div>

            {/* Cost */}
            <div
              className="font-mono font-bold text-[13.5px] text-right"
              style={{ color: isTop ? "var(--ao-accent)" : "var(--ao-fg-0)" }}
            >
              {fmtUSD(a.cost)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main modal                                                           */
/* ------------------------------------------------------------------ */

export function ClaudeLimitsModal() {
  useClaudeLimitsHydration();

  const open      = useClaudeLimitsStore((s) => s.open);
  const setOpen   = useClaudeLimitsStore((s) => s.setOpen);
  const period    = useClaudeLimitsStore((s) => s.period);

  // Local period state for the period toggle (read-only analytics — no
  // more quota/cap fields to persist).
  const [localPeriod, setLocalPeriod] = useState<LimitsPeriod>(period);

  useEffect(() => {
    if (open) setLocalPeriod(period);
  }, [open, period]);

  // ---- Data ----
  // Aggregated server-side. The previous approach fetched `/api/runs?limit=500`
  // and summed in the browser, which silently truncated every window at 500
  // runs — a 2,280-run history reported "500 runs" for both Monthly AND All
  // time, with correspondingly wrong token and cost totals.
  const start = periodStart(localPeriod);
  const end   = periodEnd(localPeriod);

  const summaryQ = useAnalyticsSummary({ start, end, days: 14, enabled: open });
  const summary = summaryQ.data;

  // Adapt the API's row objects to the `[key, value]` tuple shape the
  // existing ByModel / TopAgents presenters expect.
  const modelRows = useMemo<[string, { runs: number; tokens: number; cost: number }][]>(
    () => (summary?.byModel ?? []).map((m) => [m.model, { runs: m.runs, tokens: m.tokens, cost: m.cost }]),
    [summary],
  );
  const agentRows = useMemo<[string, { runs: number; cost: number; name: string }][]>(
    () => (summary?.byAgent ?? []).map((a) => [a.agentId, { runs: a.runs, cost: a.cost, name: a.agentName }]),
    [summary],
  );

  const totalRuns   = summary?.totalRuns   ?? 0;
  const totalTokens = summary?.totalTokens ?? 0;
  const totalCost   = summary?.totalCost   ?? 0;
  const totalAgentCost = useMemo(
    () => agentRows.reduce((s, [, v]) => s + v.cost, 0),
    [agentRows],
  );

  // Daily bars — server returns ISO day keys oldest-first; label them for display.
  const last14 = useMemo<{ label: string; spend: number }[]>(() => {
    const rows = summary?.dailySpend ?? [];
    return rows.map((r, i) => {
      const [y, m, d] = r.day.split("-").map(Number);
      const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
      const label =
        i === rows.length - 1
          ? "Today"
          : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return { label, spend: r.spend };
    });
  }, [summary]);

  return (
    <ModalShell
      open={open}
      onClose={() => setOpen(false)}
      bareContent
      maxWidth={880}
      className="ao-modal"
      closeLabel="Close usage &amp; limits"
    >
          {/* Header */}
          <LimHeader onClose={() => setOpen(false)} />

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-5 py-5 flex flex-col gap-6 [scrollbar-width:thin] [scrollbar-color:var(--ao-bg-4)_transparent]">
            {/* Stat cards */}
            <section className="flex flex-col gap-3">
              <SectionHead
                title="Overview"
                sub={periodLabel(localPeriod)}
                right={<PeriodSeg value={localPeriod} onChange={setLocalPeriod} />}
              />
              <div className="flex flex-wrap gap-[14px] [&>*]:[flex:1_1_180px]">
                <StatCard label="Total runs" value={String(totalRuns)} tint="var(--acc)" />
                <StatCard label="Total tokens" value={fmtTok(totalTokens)} tint="var(--done)" />
                <StatCard label="Total cost" value={fmtUSD(totalCost)} tint="var(--queued)" />
              </div>
            </section>

            {/* By model + Top agents — two-column, stacks on narrow */}
            <div className="flex flex-wrap gap-[14px] [&>*]:[flex:1_1_280px]">
              <section className="flex flex-col gap-3">
                <SectionHead
                  title="By model"
                  sub={periodLabel(localPeriod)}
                />
                <ByModel modelRows={modelRows} totalCost={totalCost} />
              </section>

              <section className="flex flex-col gap-3">
                <SectionHead
                  title="Top agents"
                  sub={periodLabel(localPeriod)}
                />
                <TopAgents agentRows={agentRows} totalCost={totalAgentCost} />
              </section>
            </div>

            {/* Daily spend bars */}
            <section className="flex flex-col gap-3">
              <SectionHead title="Daily spend" sub="last 14 days" />
              <DailyBars last14={last14} />
            </section>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-5 py-[14px] border-t border-[var(--ao-line-0)] shrink-0">
            <div className="flex-1 text-[11px] text-ao-fg-3 leading-[1.55] flex gap-[6px]">
              <span className="text-ao-fg-3 shrink-0 mt-[1px] text-[12px]" aria-hidden="true">ℹ</span>
              <span>
                Counts only what Agent Office summoned (saved in{" "}
                <code className="text-ao-fg-1 bg-white/[0.04] px-1 py-px rounded-[3px]">
                  ~/.claude/agent-office/db.sqlite
                </code>
                ). Anything you ran through plain{" "}
                <code className="text-ao-fg-1 bg-white/[0.04] px-1 py-px rounded-[3px]">
                  claude
                </code>{" "}
                outside the dashboard isn&apos;t included.
              </span>
            </div>
            <button
              className="px-[14px] py-[7px] rounded-[8px] text-[12.5px] font-medium cursor-pointer bg-transparent border border-ao-line-2 text-ao-fg-1 hover:bg-ao-bg-3"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
    </ModalShell>
  );
}

function StatCard({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <div
      className="flex flex-col gap-1 px-4 py-3 rounded-ao-md border"
      style={{
        background: `color-mix(in oklab, ${tint} 6%, var(--ao-bg-2))`,
        borderColor: `color-mix(in oklab, ${tint} 25%, var(--ao-line-1))`,
      }}
    >
      <div className="text-[10.5px] uppercase tracking-[0.08em] text-ao-fg-3 font-mono">{label}</div>
      <div className="text-[22px] font-bold text-ao-fg-0 tabular-nums leading-none">{value}</div>
    </div>
  );
}
