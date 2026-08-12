/**
 * Period-scoped analytics aggregation.
 *
 * The Analytics modal used to fetch raw runs (`/api/runs?limit=500`) and
 * sum them in the browser. That silently under-reported every window once
 * a workspace passed 500 runs — the API hard-caps `limit` at 500, so a
 * 2,280-run history rendered as "500 runs" for both Monthly AND All time,
 * with correspondingly wrong token and cost totals.
 *
 * Aggregating in SQL fixes the numbers and makes the payload constant-size
 * regardless of how large the history grows.
 *
 * Deliberately a separate module from `analytics.ts` (per-account stats) so
 * the two can evolve independently.
 */

import { getDb } from "./db";

export interface AnalyticsSummary {
  totalRuns: number;
  totalTokens: number;
  totalCost: number;
  byModel: Array<{ model: string; runs: number; tokens: number; cost: number }>;
  byAgent: Array<{ agentId: string; agentName: string; runs: number; cost: number }>;
}

export interface SummaryRange {
  /** Inclusive lower bound (epoch ms). `0` for all-time. */
  start: number;
  /**
   * Exclusive upper bound (epoch ms). Pass `Number.POSITIVE_INFINITY` for
   * all-time — normalized to a far-future sentinel before it reaches SQL,
   * since SQLite can't bind `Infinity`.
   */
  end: number;
  projectId?: string;
}

/** SQLite can't bind Infinity — clamp to a timestamp no run will exceed. */
const FAR_FUTURE = 8_640_000_000_000_000;

function normalizeEnd(end: number): number {
  return Number.isFinite(end) ? end : FAR_FUTURE;
}

export function getAnalyticsSummary(range: SummaryRange): AnalyticsSummary {
  const db = getDb();
  const start = range.start;
  const end = normalizeEnd(range.end);

  const scope = range.projectId ? "AND project_id = @projectId" : "";
  const params = { start, end, projectId: range.projectId ?? null };

  const totals = db
    .prepare(
      `SELECT
         COUNT(*)                                         AS runs,
         COALESCE(SUM(COALESCE(tokens_in,0) + COALESCE(tokens_out,0)), 0) AS tokens,
         COALESCE(SUM(COALESCE(cost_usd,0)), 0)           AS cost
       FROM runs
       WHERE started_at >= @start AND started_at < @end ${scope}`,
    )
    .get(params) as { runs: number; tokens: number; cost: number };

  const byModel = db
    .prepare(
      `SELECT
         COALESCE(model, 'unknown')                       AS model,
         COUNT(*)                                         AS runs,
         COALESCE(SUM(COALESCE(tokens_in,0) + COALESCE(tokens_out,0)), 0) AS tokens,
         COALESCE(SUM(COALESCE(cost_usd,0)), 0)           AS cost
       FROM runs
       WHERE started_at >= @start AND started_at < @end ${scope}
       GROUP BY COALESCE(model, 'unknown')
       ORDER BY cost DESC`,
    )
    .all(params) as AnalyticsSummary["byModel"];

  const byAgent = db
    .prepare(
      `SELECT
         agent_id                                AS agentId,
         COALESCE(MAX(agent_name), agent_id)     AS agentName,
         COUNT(*)                                AS runs,
         COALESCE(SUM(COALESCE(cost_usd,0)), 0)  AS cost
       FROM runs
       WHERE started_at >= @start AND started_at < @end ${scope}
       GROUP BY agent_id
       ORDER BY cost DESC
       LIMIT 6`,
    )
    .all(params) as AnalyticsSummary["byAgent"];

  return {
    totalRuns: totals.runs,
    totalTokens: totals.tokens,
    totalCost: totals.cost,
    byModel,
    byAgent,
  };
}

/**
 * Per-day spend for the trailing `days` window, oldest-first. Used by the
 * "Daily spend · last 14 days" chart — same truncation bug applied there.
 * Days with no runs are returned with `spend: 0` so the chart keeps a
 * stable bar count.
 */
export function getDailySpend(days: number, projectId?: string): Array<{ day: string; spend: number }> {
  const db = getDb();
  const scope = projectId ? "AND project_id = @projectId" : "";

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const startMs = start.getTime();

  const rows = db
    .prepare(
      `SELECT
         date(started_at / 1000, 'unixepoch', 'localtime') AS day,
         COALESCE(SUM(COALESCE(cost_usd,0)), 0)            AS spend
       FROM runs
       WHERE started_at >= @startMs ${scope}
       GROUP BY day`,
    )
    .all({ startMs, projectId: projectId ?? null }) as Array<{ day: string; spend: number }>;

  const spendByDay = new Map(rows.map((r) => [r.day, r.spend]));

  return Array.from({ length: days }, (_, i) => {
    const d = new Date(startMs);
    d.setDate(d.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { day: key, spend: spendByDay.get(key) ?? 0 };
  });
}
