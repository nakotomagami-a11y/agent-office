/**
 * Every cost reader over one mixed set (M-7): a legacy NULL row and the five bases. `unknown` is
 * never summed (even if a number sits in it) and is counted instead; NULL counts as notional.
 *
 *   pnpm --filter @agent-office/domain test src/services/db/cost-sql.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import Database from "better-sqlite3";
import { createSchema } from "./migrations";
import { getSpendByInstanceForProject, getSpendForInstance, insertRun, updateRun } from "./runs";
import { getAnalyticsSummary, getDailySpend } from "../analytics/analytics-summary";
import { getAnalyticsPage } from "../analytics/analytics-page";
import { listPerAccountStats } from "../analytics/analytics";
import type { CostBasis } from "../../types/index";

const mem = new Database(":memory:");
createSchema(mem);
globalThis.__agentOfficeDb = mem;

const now = Date.now();
const rows: Array<[CostBasis | null, number]> = [[null, 1], ["notional", 2], ["billed", 4], ["estimated", 8], ["unknown", 16], ["free", 0]];
for (const [i, [costBasis, cost]] of rows.entries()) {
  const id = `r${i}`;
  insertRun({ id, agentId: "dev", agentName: "Dev", instanceId: "t", projectId: "p", status: "done", prompt: "x", model: "sonnet", effort: "", startedAt: now, accountId: "a", ...(costBasis ? { costBasis } : {}) });
  updateRun(id, { status: "done", output: "", tokensIn: 1, tokensOut: 1, costUsd: cost, durMs: 1, endedAt: now });
}
const KNOWN = 15;

test("totals and breakdowns sum every basis but unknown, and count the unknown run", () => {
  const summary = getAnalyticsSummary({ start: 0, end: Number.POSITIVE_INFINITY });
  assert.deepStrictEqual([summary.totalRuns, summary.totalCost, summary.unknownCostRuns], [6, KNOWN, 1]);
  assert.equal(summary.byModel[0]?.cost, KNOWN);
  assert.equal(summary.byAgent[0]?.cost, KNOWN);
  const page = getAnalyticsPage({ start: 0, end: Number.POSITIVE_INFINITY });
  assert.deepStrictEqual([page.totals.runs, page.totals.cost, page.totals.unknownCostRuns], [6, KNOWN, 1]);
  assert.equal(page.byAgent[0]?.cost, KNOWN);
  assert.equal(page.byProject[0]?.cost, KNOWN);
});

test("daily spend, per-account spend and per-instance spend agree", () => {
  assert.equal(getDailySpend(1).at(-1)?.spend, KNOWN);
  assert.equal(listPerAccountStats().find((s) => s.accountId === "a")?.cost7dUsd, KNOWN);
  assert.equal(getSpendForInstance("dev", "t"), KNOWN);
  assert.deepStrictEqual(getSpendByInstanceForProject("p"), { "dev|t": KNOWN });
});
