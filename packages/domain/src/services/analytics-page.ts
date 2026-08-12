/**
 * Analytics page aggregation.
 *
 * `analytics-summary.ts` backs the old three-number overview. This module
 * backs the full `/analytics` page and answers a different question: not
 * "what are my totals" but "where is the money and time going, and is this
 * period unusual".
 *
 * Everything is aggregated in SQL against the `runs` / `tool_calls` tables
 * so the payload stays constant-size no matter how long the history gets.
 * All of it is one round trip — the page renders ~8 panels and fanning that
 * out into 8 requests would be silly.
 */

import { getDb } from "./db";

/* ── shapes ──────────────────────────────────────────────────────────── */

export interface AnalyticsTotals {
  runs: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  /** Wall-clock agent runtime, ms. */
  runtimeMs: number;
  done: number;
  errors: number;
}

export interface ModelFamilyRow {
  /** Consolidated family key: `opus` | `sonnet` | `haiku` | raw id. */
  family: string;
  label: string;
  runs: number;
  tokens: number;
  cost: number;
  /** Raw model ids folded into this family, for the tooltip. */
  variants: string[];
}

export interface AgentRow {
  agentId: string;
  agentName: string;
  runs: number;
  cost: number;
  runtimeMs: number;
  errors: number;
}

export interface ProjectRow {
  projectId: string;
  runs: number;
  cost: number;
  runtimeMs: number;
}

export interface ToolRow {
  name: string;
  calls: number;
  runs: number;
}

/** One cell of the 7x24 activity grid. */
export interface ActivityCell {
  /** 0 = Sunday. */
  dow: number;
  /** 0-23, local time. */
  hour: number;
  runs: number;
  cost: number;
}

export interface SeriesPoint {
  /** Bucket key — `YYYY-MM-DD` for day granularity, `YYYY-MM-DD` (week start) for week. */
  key: string;
  cost: number;
  runs: number;
  runtimeMs: number;
}

export interface AnalyticsPage {
  totals: AnalyticsTotals;
  /** Same-length window immediately before `start`. Drives the deltas. */
  previous: AnalyticsTotals;
  /** Null when the window has no meaningful "previous" (all-time). */
  hasPrevious: boolean;
  byModel: ModelFamilyRow[];
  byAgent: AgentRow[];
  byProject: ProjectRow[];
  byTool: ToolRow[];
  activity: ActivityCell[];
  series: SeriesPoint[];
  seriesGranularity: "day" | "week";
}

export interface PageRange {
  start: number;
  end: number;
  projectId?: string;
}

/* ── helpers ─────────────────────────────────────────────────────────── */

/** SQLite can't bind Infinity — clamp to a timestamp no run will exceed. */
const FAR_FUTURE = 8_640_000_000_000_000;

function normalizeEnd(end: number): number {
  return Number.isFinite(end) ? end : FAR_FUTURE;
}

/**
 * Fold raw model ids into families.
 *
 * The `runs.model` column mixes short aliases written by older code
 * (`opus`, `sonnet`) with full ids from newer runs (`claude-opus-4-7`).
 * Left ungrouped they render as separate rows, which is how a workspace
 * ends up showing four "Opus" entries that individually look small while
 * collectively dominating the bill.
 */
export function modelFamily(raw: string): { key: string; label: string } {
  const id = (raw || "unknown").toLowerCase();
  if (id.includes("opus")) return { key: "opus", label: "Opus" };
  if (id.includes("sonnet")) return { key: "sonnet", label: "Sonnet" };
  if (id.includes("haiku")) return { key: "haiku", label: "Haiku" };
  if (id.includes("fable")) return { key: "fable", label: "Fable" };
  if (id === "" || id === "default" || id === "unknown") {
    return { key: "unknown", label: "Unrecorded" };
  }
  return { key: id, label: raw };
}

const TOTALS_SQL = `
  SELECT
    COUNT(*)                                        AS runs,
    COALESCE(SUM(COALESCE(tokens_in,0)), 0)         AS tokensIn,
    COALESCE(SUM(COALESCE(tokens_out,0)), 0)        AS tokensOut,
    COALESCE(SUM(COALESCE(cost_usd,0)), 0)          AS cost,
    COALESCE(SUM(COALESCE(dur_ms,0)), 0)            AS runtimeMs,
    COALESCE(SUM(status = 'done'), 0)               AS done,
    COALESCE(SUM(status = 'error'), 0)              AS errors
  FROM runs
  WHERE started_at >= @start AND started_at < @end
`;

/* ── main ────────────────────────────────────────────────────────────── */

export function getAnalyticsPage(range: PageRange): AnalyticsPage {
  const db = getDb();
  const start = range.start;
  const end = normalizeEnd(range.end);
  const scope = range.projectId ? "AND project_id = @projectId" : "";
  const params = { start, end, projectId: range.projectId ?? null };

  const totals = db.prepare(`${TOTALS_SQL} ${scope}`).get(params) as AnalyticsTotals;

  // Previous window of equal length, for the deltas. Meaningless for
  // all-time (there is no "before the beginning"), so it's flagged off.
  const span = end - start;
  const hasPrevious = Number.isFinite(span) && span > 0 && start > 0;
  const previous = hasPrevious
    ? (db.prepare(`${TOTALS_SQL} ${scope}`).get({
        ...params,
        start: start - span,
        end: start,
      }) as AnalyticsTotals)
    : { runs: 0, tokensIn: 0, tokensOut: 0, cost: 0, runtimeMs: 0, done: 0, errors: 0 };

  const byModel = foldModels(
    db
      .prepare(
        `SELECT COALESCE(NULLIF(model,''),'unknown') AS model,
                COUNT(*) AS runs,
                COALESCE(SUM(COALESCE(tokens_in,0) + COALESCE(tokens_out,0)),0) AS tokens,
                COALESCE(SUM(COALESCE(cost_usd,0)),0) AS cost
         FROM runs
         WHERE started_at >= @start AND started_at < @end ${scope}
         GROUP BY COALESCE(NULLIF(model,''),'unknown')`,
      )
      .all(params) as Array<{ model: string; runs: number; tokens: number; cost: number }>,
  );

  const byAgent = db
    .prepare(
      `SELECT agent_id AS agentId,
              COALESCE(MAX(agent_name), agent_id) AS agentName,
              COUNT(*) AS runs,
              COALESCE(SUM(COALESCE(cost_usd,0)),0) AS cost,
              COALESCE(SUM(COALESCE(dur_ms,0)),0) AS runtimeMs,
              COALESCE(SUM(status='error'),0) AS errors
       FROM runs
       WHERE started_at >= @start AND started_at < @end ${scope}
       GROUP BY agent_id
       ORDER BY cost DESC
       LIMIT 12`,
    )
    .all(params) as AgentRow[];

  // Project breakdown is pointless when the window is already scoped to one.
  const byProject = range.projectId
    ? []
    : (db
        .prepare(
          `SELECT COALESCE(project_id,'(unassigned)') AS projectId,
                  COUNT(*) AS runs,
                  COALESCE(SUM(COALESCE(cost_usd,0)),0) AS cost,
                  COALESCE(SUM(COALESCE(dur_ms,0)),0) AS runtimeMs
           FROM runs
           WHERE started_at >= @start AND started_at < @end
           GROUP BY COALESCE(project_id,'(unassigned)')
           ORDER BY cost DESC
           LIMIT 10`,
        )
        .all(params) as ProjectRow[]);

  const byTool = db
    .prepare(
      `SELECT tc.name AS name,
              COUNT(*) AS calls,
              COUNT(DISTINCT tc.run_id) AS runs
       FROM tool_calls tc
       JOIN runs r ON r.id = tc.run_id
       WHERE r.started_at >= @start AND r.started_at < @end ${scope.replace(/project_id/g, "r.project_id")}
       GROUP BY tc.name
       ORDER BY calls DESC
       LIMIT 12`,
    )
    .all(params) as ToolRow[];

  const activity = db
    .prepare(
      `SELECT CAST(strftime('%w', started_at/1000, 'unixepoch', 'localtime') AS INTEGER) AS dow,
              CAST(strftime('%H', started_at/1000, 'unixepoch', 'localtime') AS INTEGER) AS hour,
              COUNT(*) AS runs,
              COALESCE(SUM(COALESCE(cost_usd,0)),0) AS cost
       FROM runs
       WHERE started_at >= @start AND started_at < @end ${scope}
       GROUP BY dow, hour`,
    )
    .all(params) as ActivityCell[];

  const { series, granularity } = buildSeries(db, params, scope);

  return {
    totals,
    previous,
    hasPrevious,
    byModel,
    byAgent,
    byProject,
    byTool,
    activity,
    series,
    seriesGranularity: granularity,
  };
}

/* ── series ──────────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;

/**
 * Trend series. Buckets by day for windows up to ~10 weeks, by week beyond
 * that — a 14-month all-time view as 400 daily bars is noise, not a trend.
 * Empty buckets are filled so the chart keeps an even time axis.
 */
function buildSeries(
  db: ReturnType<typeof getDb>,
  params: Record<string, unknown>,
  scope: string,
): { series: SeriesPoint[]; granularity: "day" | "week" } {
  // Resolve the real bounds — all-time starts at the first run, not epoch 0.
  const bounds = db
    .prepare(
      `SELECT MIN(started_at) AS lo, MAX(started_at) AS hi
       FROM runs WHERE started_at >= @start AND started_at < @end ${scope}`,
    )
    .get(params) as { lo: number | null; hi: number | null };

  if (bounds.lo == null || bounds.hi == null) {
    return { series: [], granularity: "day" };
  }

  const spanDays = Math.max(1, Math.ceil((bounds.hi - bounds.lo) / DAY_MS) + 1);
  const granularity: "day" | "week" = spanDays > 70 ? "week" : "day";

  const bucketExpr =
    granularity === "week"
      ? // Monday-anchored ISO-ish week start.
        `date(started_at/1000, 'unixepoch', 'localtime', 'weekday 0', '-6 days')`
      : `date(started_at/1000, 'unixepoch', 'localtime')`;

  const rows = db
    .prepare(
      `SELECT ${bucketExpr} AS key,
              COALESCE(SUM(COALESCE(cost_usd,0)),0) AS cost,
              COUNT(*) AS runs,
              COALESCE(SUM(COALESCE(dur_ms,0)),0) AS runtimeMs
       FROM runs
       WHERE started_at >= @start AND started_at < @end ${scope}
       GROUP BY key
       ORDER BY key`,
    )
    .all(params) as SeriesPoint[];

  const byKey = new Map(rows.map((r) => [r.key, r]));
  const step = granularity === "week" ? 7 : 1;

  // Walk from the first bucket to the last, filling gaps with zeroes.
  const first = new Date(bounds.lo);
  first.setHours(0, 0, 0, 0);
  if (granularity === "week") {
    // back up to Monday
    const shift = (first.getDay() + 6) % 7;
    first.setDate(first.getDate() - shift);
  }
  const last = new Date(bounds.hi);
  last.setHours(0, 0, 0, 0);

  const out: SeriesPoint[] = [];
  const cursor = new Date(first);
  let guard = 0;
  while (cursor <= last && guard++ < 800) {
    const key = ymd(cursor);
    out.push(byKey.get(key) ?? { key, cost: 0, runs: 0, runtimeMs: 0 });
    cursor.setDate(cursor.getDate() + step);
  }

  return { series: out, granularity };
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ── model folding ───────────────────────────────────────────────────── */

function foldModels(
  rows: Array<{ model: string; runs: number; tokens: number; cost: number }>,
): ModelFamilyRow[] {
  const acc = new Map<string, ModelFamilyRow>();
  for (const r of rows) {
    const { key, label } = modelFamily(r.model);
    const cur = acc.get(key);
    if (cur) {
      cur.runs += r.runs;
      cur.tokens += r.tokens;
      cur.cost += r.cost;
      if (!cur.variants.includes(r.model)) cur.variants.push(r.model);
    } else {
      acc.set(key, {
        family: key,
        label,
        runs: r.runs,
        tokens: r.tokens,
        cost: r.cost,
        variants: [r.model],
      });
    }
  }
  return [...acc.values()].sort((a, b) => b.cost - a.cost);
}
