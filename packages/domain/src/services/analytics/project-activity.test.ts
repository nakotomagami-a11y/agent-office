/**
 * Runs against throwaway in-memory SQLite — never touches the real DB.
 *
 *   pnpm --filter @agent-office/domain test src/services/analytics/project-activity.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import Database from "better-sqlite3";
import { createSchema } from "./../db/migrations";
import { insertRun, updateRun } from "./../db/runs";
import { getProjectActivity } from "./project-activity";

const mem = new Database(":memory:");
mem.pragma("foreign_keys = ON");
createSchema(mem);
globalThis.__agentOfficeDb = mem;

const H = 3_600_000;
const START = 1_000 * H;
let seq = 0;
function run(startedAt: number, opts: { projectId?: string; status?: string; cost?: number; costBasis?: "unknown" } = {}) {
  const id = `run-${++seq}`;
  insertRun({ id, agentId: "dev", agentName: "Dev", status: "running", prompt: "p", model: "", effort: "", startedAt, projectId: opts.projectId ?? "p1", costBasis: opts.costBasis });
  updateRun(id, { status: opts.status ?? "done", output: "", tokensIn: 0, tokensOut: 0, costUsd: opts.cost ?? 0, durMs: 0, endedAt: startedAt });
}

// Current window [START, START + 4h), now at START + 2.5h.
run(START, { cost: 1 });
run(START + 0.5 * H, { status: "error", cost: 0.5 });
run(START + 2 * H, { cost: 2 });
run(START + 2 * H + 1, { cost: 9, costBasis: "unknown" });
run(START + 3 * H);                         // after now: clipped
run(START + H, { projectId: "other", cost: 100 });
// Previous window [START - 4h, START - 1.5h) after clipping.
run(START - 4 * H, { cost: 0.25 });
run(START - 2 * H, { status: "error" });
run(START - H);                             // past the clipped prior end

const NOW = START + 2.5 * H;
const activity = () => getProjectActivity({ projectId: "p1", start: START, bucketMs: H, count: 4 }, NOW);

test("runs land in their bucket, empty buckets are zero-filled", () => {
  assert.deepEqual(activity().buckets, [
    { runs: 2, errors: 1, cost: 1.5 },
    { runs: 0, errors: 0, cost: 0 },
    { runs: 2, errors: 0, cost: 2 },
    { runs: 0, errors: 0, cost: 0 },
  ]);
});

test("totals cover the window up to now, scoped to the project", () => {
  assert.deepEqual(activity().totals, { runs: 4, errors: 1, cost: 3.5 });
});

test("an unknown-cost run is counted but adds nothing to cost", () => {
  assert.equal(activity().buckets[2]?.runs, 2);
  assert.equal(activity().buckets[2]?.cost, 2);
});

test("previous is the same elapsed length one span earlier", () => {
  assert.deepEqual(activity().previous, { runs: 2, errors: 1, cost: 0.25 });
});

test("a window that has not started yet is empty", () => {
  const d = getProjectActivity({ projectId: "p1", start: START, bucketMs: H, count: 4 }, START - 1);
  assert.deepEqual(d.totals, { runs: 0, errors: 0, cost: 0 });
  assert.deepEqual(d.previous, { runs: 0, errors: 0, cost: 0 });
  assert.equal(d.buckets.length, 4);
});
