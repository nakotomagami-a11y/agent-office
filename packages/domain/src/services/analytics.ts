/**
 * Analytics — thin read-only rollups over the `runs` table. Slice 5 exposes
 * per-account counts + spend so the Accounts tab can show at-a-glance usage.
 *
 * NULL `account_id` on legacy rows is treated as the `default` account
 * (rows logged before slice 2 landed the column).
 */

import { getDb } from "./db";

export interface AccountStats {
  /**
   * `null` = rows written before slice 2 (no account_id). The client
   * folds these into the `default` account for display purposes.
   */
  accountId: string | null;
  runs24h: number;
  runs7d: number;
  runsAllTime: number;
  cost7dUsd: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface Row {
  account_id: string | null;
  runs_24h: number;
  runs_7d: number;
  runs_all_time: number;
  cost_7d: number;
}

export function listPerAccountStats(): AccountStats[] {
  const now = Date.now();
  const cutoff24h = now - DAY_MS;
  const cutoff7d = now - 7 * DAY_MS;

  const rows = getDb()
    .prepare(`
      SELECT
        account_id,
        SUM(CASE WHEN started_at >= @c24 THEN 1 ELSE 0 END) AS runs_24h,
        SUM(CASE WHEN started_at >= @c7d THEN 1 ELSE 0 END) AS runs_7d,
        COUNT(*) AS runs_all_time,
        COALESCE(SUM(CASE WHEN started_at >= @c7d THEN cost_usd ELSE 0 END), 0) AS cost_7d
      FROM runs
      GROUP BY account_id
    `)
    .all({ c24: cutoff24h, c7d: cutoff7d }) as Row[];

  return rows.map((r) => ({
    accountId: r.account_id,
    runs24h: r.runs_24h,
    runs7d: r.runs_7d,
    runsAllTime: r.runs_all_time,
    cost7dUsd: r.cost_7d,
  }));
}
