"use client";

import type { ReactNode } from "react";
import type { GitStatus, PersistedRun } from "@agent-office/domain/types";
import { Sparkline } from "@/components/ui/sparkline";
import { computeRunStats } from "../format/run-stats";
import { formatCost } from "@/modules/runs/format/format-run-meta";

export type ProjectStatCardsProps = {
  /** Server-maintained lifetime run count — `runs` below is just the fetched window. */
  totalRunCount: number;
  runs: PersistedRun[];
  gitStatus: GitStatus | undefined;
  lastRunAt: number | undefined;
};

/**
 * The four dashboard stat cards (total runs, spend today, success rate,
 * working tree). Every number here is derived from real data the caller
 * already fetched — no fabricated trend percentages or commit history.
 */
export function ProjectStatCards({ totalRunCount, runs, gitStatus, lastRunAt }: ProjectStatCardsProps) {
  const stats = computeRunStats(runs);

  return (
    <div className="flex flex-wrap gap-[16px]">
      <StatCard className="flex-1 min-w-[220px]" label="Total runs" trendPct={stats.runsTrendPct}>
        <div className="text-[34px] font-extrabold tracking-[-0.035em] mt-[8px]">{totalRunCount}</div>
        <Sparkline values={stats.dailyRunCounts} color="#8b7bff" className="block mt-[6px]" />
      </StatCard>

      <StatCard className="flex-1 min-w-[220px]" label="Spend today" trendPct={stats.spendTrendPct} trendGoodDirection="down">
        <div className="text-[34px] font-extrabold tracking-[-0.035em] mt-[8px]">{formatCost(stats.spendToday)}</div>
        <Sparkline values={stats.dailySpend} color="#22d3ee" className="block mt-[6px]" />
      </StatCard>

      <SuccessRateCard successRate={stats.successRate} failedCount={stats.failedCount} completedCount={stats.completedCount} />

      <WorkingTreeCard gitStatus={gitStatus} lastRunAt={lastRunAt} />
    </div>
  );
}

function StatCard({
  label,
  trendPct,
  trendGoodDirection = "up",
  className,
  children,
}: {
  label: string;
  /** `null` hides the trend pill entirely — no baseline to compare against yet. */
  trendPct: number | null;
  /** Which direction of change should render green vs. red (spend down is good; runs up is good). */
  trendGoodDirection?: "up" | "down";
  className?: string;
  children: ReactNode;
}) {
  const isUp = (trendPct ?? 0) >= 0;
  const isGood = trendGoodDirection === "up" ? isUp : !isUp;
  return (
    <div className={`rounded-[22px] surface-sheen shadow-[var(--lift)] px-[20px] pt-[18px] pb-0 overflow-hidden ${className ?? ""}`}>
      <div className="flex items-center gap-[10px]">
        <span className="text-[12.5px] font-semibold text-txt-3 whitespace-nowrap">{label}</span>
        <span className="flex-1" />
        {trendPct !== null && (
          <span
            className={`flex items-center gap-[4px] px-[8px] py-[3px] rounded-full text-[10.5px] font-bold whitespace-nowrap shrink-0 ${
              isGood ? "bg-green-soft text-green" : "bg-red-soft text-red"
            }`}
          >
            {isUp ? "▲" : "▼"} {Math.abs(trendPct).toFixed(1)}%
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function SuccessRateCard({
  successRate,
  failedCount,
  completedCount,
}: {
  successRate: number | null;
  failedCount: number;
  completedCount: number;
}) {
  const rate = successRate ?? 0;
  const radius = 31;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - rate / 100);
  const finished = failedCount + completedCount;

  return (
    <div className="flex-1 min-w-[220px] rounded-[22px] surface-sheen shadow-[var(--lift)] px-[20px] py-[18px] flex items-center gap-[16px]">
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold text-txt-3 whitespace-nowrap">Success rate</div>
        {successRate === null ? (
          <div className="text-[15px] font-semibold text-txt-4 mt-[12px]">No runs yet</div>
        ) : (
          <>
            <div className="text-[34px] font-extrabold tracking-[-0.035em] mt-[8px]">
              {successRate}
              <span className="text-[18px] text-txt-3">%</span>
            </div>
            <div className="text-[11px] text-txt-4 mt-[4px]">{failedCount} failed of {finished}</div>
          </>
        )}
      </div>
      <svg width="78" height="78" viewBox="0 0 78 78" className="shrink-0">
        <circle cx="39" cy="39" r={radius} fill="none" stroke="var(--card-3)" strokeWidth="8" />
        <circle
          cx="39"
          cy="39"
          r={radius}
          fill="none"
          stroke="var(--green)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 39 39)"
        />
      </svg>
    </div>
  );
}

function WorkingTreeCard({ gitStatus, lastRunAt }: { gitStatus: GitStatus | undefined; lastRunAt: number | undefined }) {
  if (!gitStatus?.isGit) {
    return (
      <div className="flex-1 min-w-[220px] rounded-[22px] surface-sheen shadow-[var(--lift)] px-[20px] py-[18px]">
        <div className="text-[12.5px] font-semibold text-txt-3 whitespace-nowrap">Working tree</div>
        <div className="text-[15px] font-semibold text-txt-4 mt-[12px]">Not a git repo</div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-[220px] rounded-[22px] surface-sheen shadow-[var(--lift)] px-[20px] py-[18px]">
      <div className="flex items-center gap-[10px]">
        <span className="text-[12.5px] font-semibold text-txt-3 whitespace-nowrap">Working tree</span>
        <span className="flex-1" />
        {gitStatus.branch && (
          <span className="text-[10.5px] font-bold px-[8px] py-[3px] rounded-full bg-card-3 text-txt-3 whitespace-nowrap shrink-0">
            {gitStatus.branch}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-[12px] mt-[8px]">
        <span className="text-[30px] font-extrabold tracking-[-0.035em] text-green">+{gitStatus.added}</span>
        <span className="text-[22px] font-bold tracking-[-0.03em] text-red">−{gitStatus.removed}</span>
      </div>
      <div className="flex items-center gap-[12px] mt-[12px] font-mono text-[11px] text-txt-4">
        <span>{gitStatus.filesChanged} file{gitStatus.filesChanged === 1 ? "" : "s"} changed</span>
        {gitStatus.ahead > 0 && <span className="text-green">↑ {gitStatus.ahead} ahead</span>}
        {gitStatus.behind > 0 && <span className="text-amber">↓ {gitStatus.behind} behind</span>}
      </div>
      {lastRunAt && (
        <div className="text-[11px] text-txt-4 mt-[9px]">
          last run {new Date(lastRunAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
}
