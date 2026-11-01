/**
 * The schedules list groups rows by day and files finished jobs by when they ran: "run now" never
 * moves `fireAt`, so a job set for next week but run today must land under Today.
 */
import assert from "node:assert";
import { test } from "node:test";
import type { ScheduledJob } from "@agent-office/domain/types";
import { dayLabel, groupByDay, groupJobs, scheduleErrorText, scheduleSummary, shownAt } from "./schedule-format";

const H = 3_600_000;
const job = (o: Partial<ScheduledJob>): ScheduledJob => ({
  id: "j", fireAt: Date.now() + H, summonRequest: { agentId: "dev", prompt: "p" }, reason: "manual", label: "p",
  status: "pending", attempts: 0, createdAt: 0, updatedAt: 0, ...o,
});

test("today, tomorrow and yesterday get their names", () => {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  assert.equal(dayLabel(noon.getTime()), "Today");
  assert.equal(dayLabel(noon.getTime() + 24 * H), "Tomorrow");
  assert.equal(dayLabel(noon.getTime() - 24 * H), "Yesterday");
});

test("consecutive rows on one day share a group, in the caller's order", () => {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  const t = noon.getTime();
  const groups = groupByDay([t, t + H, t + 24 * H], (x) => x);
  assert.deepEqual(groups.map((g) => [g.label, g.items.length]), [["Today", 2], ["Tomorrow", 1]]);
});

test("a finished job is placed by when it ran, a pending one by when it fires", () => {
  const ranAt = Date.now() - 60_000;
  assert.equal(shownAt(job({ status: "done", fireAt: Date.now() + 120 * H, updatedAt: ranAt })), ranAt);
  const fireAt = Date.now() + H;
  assert.equal(shownAt(job({ fireAt, updatedAt: ranAt })), fireAt);
});

test("the summary counts one-shots and series apart", () => {
  const line = scheduleSummary([
    job({ reason: "rate-limit" }),
    job({ repeat: { every: "daily", anchorAt: 0 } }),
  ]);
  assert.match(line, /^1 queued · next fires in \d+[mh] · 1 watcher armed · 1 repeating$/);
});

test("server error codes become copy, unknown ones a generic line", () => {
  assert.equal(scheduleErrorText(new Error("schedule_not_runnable")), "it's already running or finished");
  assert.equal(scheduleErrorText(new Error("weird_code")), "something went wrong — try again");
});

test("a series' next slot is in Upcoming and Recurring; attention counts toward Upcoming only", () => {
  const g = groupJobs([
    job({ id: "once" }),
    job({ id: "series", repeat: { every: "daily", anchorAt: 0 } }),
    job({ id: "stuck", status: "needs-attention", attention: "stale", repeat: { every: "daily", anchorAt: 0 } }),
    job({ id: "ran", status: "done" }),
  ]);
  assert.deepEqual(g.upcoming.map((j) => j.id).sort(), ["once", "series"]);
  assert.deepEqual(g.recurring.map((j) => j.id), ["series"]);
  assert.deepEqual(g.counts, { upcoming: 3, recurring: 1, history: 1 });
});
