/**
 * Day-based series keep their wall-clock time across DST. CI runs in UTC (no DST), so the zone is
 * forced here, before any Date is built.
 *
 *   pnpm --filter @agent-office/domain test src/services/execution/scheduler.dst.test.ts
 */
process.env.TZ = "America/New_York";

import assert from "node:assert";
import { test } from "node:test";

const { nextOccurrence } = await import("./schedule-recurrence");

const local = (mo: number, d: number, h: number, mi: number) => new Date(2026, mo - 1, d, h, mi).getTime();

test("the zone is really forced", () => {
  assert.deepEqual([new Date(2026, 0, 1).getTimezoneOffset(), new Date(2026, 6, 1).getTimezoneOffset()], [300, 240]);
});

test("a 02:30 daily series comes back to 02:30 after the spring-forward gap", () => {
  const repeat = { every: "daily" as const, anchorAt: local(1, 5, 2, 30) };
  const afterGap = new Date(nextOccurrence(repeat, local(3, 9, 12, 0)));
  assert.deepEqual([afterGap.getDate(), afterGap.getHours(), afterGap.getMinutes()], [10, 2, 30]);
  const autumn = new Date(nextOccurrence(repeat, local(11, 20, 12, 0)));
  assert.deepEqual([autumn.getDate(), autumn.getHours(), autumn.getMinutes()], [21, 2, 30]);
});

test("a 09:00 weekly series stays at 09:00 across both changes", () => {
  const repeat = { every: "weekly" as const, anchorAt: local(1, 5, 9, 0) };
  for (const after of [local(3, 10, 0, 0), local(11, 3, 0, 0)]) {
    assert.equal(new Date(nextOccurrence(repeat, after)).getHours(), 9);
  }
});
