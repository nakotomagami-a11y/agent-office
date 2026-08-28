// Pure functions that turn a project's run history into dashboard numbers.
// No side effects, no fetching — callers pass in the runs already loaded via
// `useRuns()` so these stay trivially testable and reusable across the stat
// cards, the live-runs panel, and the recent-runs table.

import type { PersistedRun } from "@agent-office/domain/types";

const DAY_MS = 86_400_000;
/** How many trailing days the stat-card sparklines cover. */
const SPARKLINE_DAYS = 8;

export interface RunStats {
  /** Runs that finished successfully, in the window covered by `runs`. */
  completedCount: number;
  /** Runs that errored out, in the window covered by `runs`. */
  failedCount: number;
  /** 0-100, or `null` when no run has finished yet (nothing to divide by). */
  successRate: number | null;
  /** Total cost across runs started today (local midnight cutoff). */
  spendToday: number;
  /** Run count per day, oldest → newest, for the last `SPARKLINE_DAYS` days. */
  dailyRunCounts: number[];
  /** Cost per day, oldest → newest, for the last `SPARKLINE_DAYS` days. */
  dailySpend: number[];
  /** % change in run count vs. the prior day, or `null` without a baseline. */
  runsTrendPct: number | null;
  /** % change in spend vs. the prior day, or `null` without a baseline. */
  spendTrendPct: number | null;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Signed percent change, or `null` when there's no non-zero baseline to compare against. */
function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Buckets `runs` by calendar day and derives the headline dashboard stats.
 * Callers combine this with `project.runCount` (the server-maintained
 * lifetime total) for the "Total runs" card — `runs` itself is whatever
 * window `useRuns()` fetched, not necessarily the project's full history.
 */
export function computeRunStats(runs: PersistedRun[]): RunStats {
  const today = startOfDay(Date.now());
  const buckets = new Map<number, { count: number; spend: number }>();
  for (let i = 0; i < SPARKLINE_DAYS; i++) {
    buckets.set(today - i * DAY_MS, { count: 0, spend: 0 });
  }

  let spendToday = 0;
  let completedCount = 0;
  let failedCount = 0;
  for (const run of runs) {
    const bucket = buckets.get(startOfDay(run.ts));
    if (bucket) {
      bucket.count += 1;
      bucket.spend += run.cost;
    }
    if (startOfDay(run.ts) === today) spendToday += run.cost;
    if (run.status === "done") completedCount += 1;
    if (run.status === "error") failedCount += 1;
  }

  const orderedDays = [...buckets.keys()].sort((a, b) => a - b);
  const dailyRunCounts = orderedDays.map((d) => buckets.get(d)!.count);
  const dailySpend = orderedDays.map((d) => buckets.get(d)!.spend);
  const finishedCount = completedCount + failedCount;

  return {
    completedCount,
    failedCount,
    successRate: finishedCount > 0 ? Math.round((completedCount / finishedCount) * 100) : null,
    spendToday,
    dailyRunCounts,
    dailySpend,
    runsTrendPct: pctChange(dailyRunCounts.at(-1) ?? 0, dailyRunCounts.at(-2) ?? 0),
    spendTrendPct: pctChange(dailySpend.at(-1) ?? 0, dailySpend.at(-2) ?? 0),
  };
}

/** Runs still in flight, most recently started first. */
export function runningRuns(runs: PersistedRun[]): PersistedRun[] {
  return runs.filter((r) => r.status === "running").sort((a, b) => b.ts - a.ts);
}
