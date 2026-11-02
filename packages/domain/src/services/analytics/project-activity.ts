/**
 * Run activity for one project in fixed-size time buckets — the project
 * dashboard's Activity card. `analytics-page.ts` only buckets by local day,
 * and the card needs half-hour and four-hour slots too.
 */

import { getDb, KNOWN_COST_USD } from "../db";
import type { ActivityCounts, ProjectActivity, ProjectActivityRange } from "../../types/index";
export type { ActivityCounts, ProjectActivity, ProjectActivityRange } from "../../types/index";

const COUNTS_SQL = `
  SELECT
    COUNT(*)                            AS runs,
    COALESCE(SUM(status = 'error'), 0)  AS errors,
    COALESCE(SUM(${KNOWN_COST_USD}), 0) AS cost
  FROM runs
  WHERE project_id = @projectId AND started_at >= @start AND started_at < @end
`;

export function getProjectActivity(range: ProjectActivityRange, now = Date.now()): ProjectActivity {
  const db = getDb();
  const { projectId, start, bucketMs, count } = range;
  const span = bucketMs * count;
  // Clipped to now so "vs prior" compares equal elapsed time, not a full prior day with a partial today.
  const end = Math.max(start, Math.min(start + span, now));

  const rows = db
    .prepare(
      `SELECT CAST((started_at - @start) / @bucketMs AS INTEGER) AS idx,
              COUNT(*) AS runs,
              COALESCE(SUM(status = 'error'), 0) AS errors,
              COALESCE(SUM(${KNOWN_COST_USD}), 0) AS cost
       FROM runs
       WHERE project_id = @projectId AND started_at >= @start AND started_at < @end
       GROUP BY idx`,
    )
    .all({ projectId, start, end, bucketMs }) as Array<ActivityCounts & { idx: number }>;

  const buckets: ActivityCounts[] = Array.from({ length: count }, () => ({ runs: 0, errors: 0, cost: 0 }));
  const totals: ActivityCounts = { runs: 0, errors: 0, cost: 0 };
  for (const { idx, runs, errors, cost } of rows) {
    buckets[idx] = { runs, errors, cost };
    totals.runs += runs;
    totals.errors += errors;
    totals.cost += cost;
  }

  const previous = db.prepare(COUNTS_SQL).get({ projectId, start: start - span, end: end - span }) as ActivityCounts;

  return { buckets, totals, previous };
}
