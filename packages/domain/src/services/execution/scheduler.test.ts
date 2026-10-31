/**
 * A job pointed at another seat must not resume, or be adopted by, the old seat's conversation.
 * A recurring job re-arms on its own wall-clock slots instead of finishing.
 *
 *   pnpm --filter @agent-office/domain test src/services/execution/scheduler.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import Database from "better-sqlite3";
import type { ScheduledJob } from "../../types/index";
import { createSchema } from "../db/migrations";
import { insertRun, setRunRateLimitResetsAt, updateRun } from "../db/runs";
import { getDb } from "../db/connection";
import { getScheduledJob, updateScheduledJob } from "../db/scheduled-jobs";
import { nextOccurrence } from "./schedule-recurrence";
import { cancelJob, createJob, fireDue, reassignJob, reconcileFiring, runNow } from "./scheduler";

const mem = new Database(":memory:");
mem.pragma("foreign_keys = ON");
createSchema(mem);
globalThis.__agentOfficeDb = mem;

const resumeJob = () => {
  const job = createJob({
    fireAt: Date.now() + 60_000,
    reason: "rate-limit",
    summonRequest: { agentId: "dev", prompt: "continue", projectId: "p", instanceId: "dev-1", conversationId: "conv-1", resumeSessionId: "sess-1" },
  });
  updateScheduledJob(job.id, { status: "needs-attention", attention: "missing-instance" });
  return job;
};

test("reassigning to another seat drops the conversation and session it would have resumed", () => {
  for (const target of [{ instanceId: "dev-2" }, { agentId: "qa" }, { projectId: "q" }]) {
    const req = (reassignJob(resumeJob().id, target) as ScheduledJob).summonRequest;
    assert.equal(req.conversationId, undefined, JSON.stringify(target));
    assert.equal(req.resumeSessionId, undefined, JSON.stringify(target));
  }
});

test("re-arming on the same seat keeps them", () => {
  const req = (reassignJob(resumeJob().id, { instanceId: "dev-1" }) as ScheduledJob).summonRequest;
  assert.equal(req.conversationId, "conv-1");
  assert.equal(req.resumeSessionId, "sess-1");
});

let runSeq = 0;
/** A finished run for a firing job to reconcile against. */
function finishedRun(): string {
  const id = `done-run-${++runSeq}`;
  insertRun({ id, agentId: "dev", agentName: "Dev", status: "running", prompt: "p", model: "m", effort: "e", startedAt: 1 });
  updateRun(id, { status: "done", output: "", tokensIn: 0, tokensOut: 0, costUsd: 0, durMs: 1, endedAt: 2 });
  return id;
}

const at = (y: number, mo: number, d: number, h = 9, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

test("daily and weekly keep the anchor's local time of day", () => {
  const anchorAt = at(2026, 3, 1);
  assert.equal(nextOccurrence({ every: "daily", anchorAt }, at(2026, 4, 10, 12)), at(2026, 4, 11));
  assert.equal(nextOccurrence({ every: "daily", anchorAt }, at(2026, 4, 10, 8)), at(2026, 4, 10));
  assert.equal(nextOccurrence({ every: "weekly", anchorAt }, anchorAt), at(2026, 3, 8));
});

test("the next slot is strictly after, and never before the anchor", () => {
  const anchorAt = at(2026, 3, 1);
  assert.equal(nextOccurrence({ every: "daily", anchorAt }, anchorAt), at(2026, 3, 2));
  assert.equal(nextOccurrence({ every: "daily", anchorAt }, anchorAt - 1), anchorAt);
  assert.equal(nextOccurrence({ every: "hourly", anchorAt }, anchorAt - 5 * 3_600_000), anchorAt);
  assert.equal(nextOccurrence({ every: "hourly", anchorAt }, anchorAt + 90 * 60_000), anchorAt + 2 * 3_600_000);
});

test("weekdays skips Saturday and Sunday", () => {
  const friday = at(2026, 10, 30);
  assert.equal(new Date(friday).getDay(), 5);
  assert.equal(nextOccurrence({ every: "weekdays", anchorAt: friday }, friday), at(2026, 11, 2));
});

test("a recurring job re-arms to its next slot instead of finishing, without the retry session", () => {
  const fireAt = Date.now() + 60_000;
  const job = createJob({ fireAt, repeat: "daily", summonRequest: { agentId: "dev", prompt: "standup" } });
  assert.deepEqual(job.repeat, { every: "daily", anchorAt: fireAt });
  updateScheduledJob(job.id, {
    status: "firing",
    firedRunId: finishedRun(),
    attempts: 2,
    summonRequest: { ...job.summonRequest, resumeSessionId: "sess-retry" },
  });
  reconcileFiring(getScheduledJob(job.id)!);
  const after = getScheduledJob(job.id)!;
  assert.equal(after.status, "pending");
  assert.equal(after.fireAt, nextOccurrence(job.repeat!, fireAt));
  assert.equal(after.attempts, 0);
  assert.equal(after.summonRequest.resumeSessionId, undefined);
  assert.deepEqual(after.repeat, job.repeat);
});

test("a one-shot still finishes", () => {
  const job = createJob({ fireAt: Date.now() + 60_000, summonRequest: { agentId: "dev", prompt: "once" } });
  assert.equal(job.repeat, undefined);
  updateScheduledJob(job.id, { status: "firing", firedRunId: finishedRun() });
  reconcileFiring(getScheduledJob(job.id)!);
  assert.equal(getScheduledJob(job.id)!.status, "done");
});

test("a recurring job whose first time already passed starts at the next slot", () => {
  const past = Date.now() - 2.5 * 3_600_000;
  const job = createJob({ fireAt: past, repeat: "hourly", summonRequest: { agentId: "dev", prompt: "tick" } });
  assert.ok(job.fireAt > Date.now() && job.fireAt <= Date.now() + 3_600_000);
});

const daily = (prompt: string) =>
  createJob({ fireAt: Date.now() + 60_000, repeat: "daily", summonRequest: { agentId: "dev", prompt } });

test("a cancel while the tick held a firing snapshot wins: the series does not re-arm", () => {
  const job = daily("cancel race");
  updateScheduledJob(job.id, { status: "firing", firedRunId: finishedRun() });
  const snapshot = getScheduledJob(job.id)!;
  cancelJob(job.id);
  reconcileFiring(snapshot);
  assert.equal(getScheduledJob(job.id)!.status, "cancelled");
});

test("run now refuses a cancelled or firing job", async () => {
  const job = daily("run now guard");
  updateScheduledJob(job.id, { status: "firing" });
  assert.equal(await runNow(job.id), "not_runnable");
  cancelJob(job.id);
  assert.equal(await runNow(job.id), "not_runnable");
});

test("re-arming clears a recovered series' attention", () => {
  const job = daily("recovered");
  updateScheduledJob(job.id, { status: "firing", attention: "retry-exceeded", firedRunId: finishedRun() });
  reconcileFiring(getScheduledJob(job.id)!);
  assert.equal(getScheduledJob(job.id)!.attention, undefined);
});

test("a rate-limited occurrence retries at the reset, then re-arms on the anchor's slots", () => {
  const job = daily("limited");
  insertRun({ id: "rl-run", agentId: "dev", agentName: "Dev", status: "running", prompt: "limited", model: "m", effort: "e", startedAt: 1 });
  updateRun("rl-run", { status: "error", output: "", tokensIn: 0, tokensOut: 0, costUsd: 0, durMs: 1, endedAt: 2 });
  const resetsAt = Math.floor((job.fireAt + 30 * 60_000) / 1000);
  setRunRateLimitResetsAt("rl-run", resetsAt);
  updateScheduledJob(job.id, { status: "firing", firedRunId: "rl-run" });
  reconcileFiring(getScheduledJob(job.id)!);
  const retry = getScheduledJob(job.id)!;
  assert.deepEqual([retry.status, retry.fireAt, retry.attempts], ["pending", resetsAt * 1000, 1]);

  updateScheduledJob(job.id, { status: "firing", firedRunId: finishedRun() });
  reconcileFiring(getScheduledJob(job.id)!);
  const next = getScheduledJob(job.id)!;
  assert.equal(next.fireAt, nextOccurrence(job.repeat!, resetsAt * 1000));
  assert.equal(new Date(next.fireAt).getMinutes(), new Date(job.fireAt).getMinutes());
  assert.equal(next.attempts, 0);
});

test("a weekdays series anchored on a Saturday starts on Monday", () => {
  const saturday = at(2027, 1, 2);
  assert.equal(new Date(saturday).getDay(), 6);
  const job = createJob({ fireAt: saturday, repeat: "weekdays", summonRequest: { agentId: "dev", prompt: "wk" } });
  assert.equal(job.fireAt, at(2027, 1, 4));
});

test("a firing job whose run id hasn't landed yet is left alone", () => {
  const job = daily("just claimed");
  updateScheduledJob(job.id, { status: "firing" });
  reconcileFiring(getScheduledJob(job.id)!);
  assert.equal(getScheduledJob(job.id)!.status, "firing");
});

test("a missed recurring slot over 12h old is skipped, not parked", async () => {
  const job = createJob({ fireAt: Date.now() + 60_000, repeat: "hourly", summonRequest: { agentId: "no-such-agent", prompt: "x" } });
  updateScheduledJob(job.id, { fireAt: Date.now() - 13 * 3_600_000 });
  await fireDue(getScheduledJob(job.id)!, Date.now());
  const after = getScheduledJob(job.id)!;
  assert.equal(after.status, "pending");
  assert.ok(after.fireAt > Date.now());
});

test("reassign refuses a cancelled or firing job", () => {
  const job = daily("no reassign");
  updateScheduledJob(job.id, { status: "firing" });
  assert.equal(reassignJob(job.id, { agentId: "qa" }), "not_reassignable");
  cancelJob(job.id);
  assert.equal(reassignJob(job.id, { agentId: "qa" }), "not_reassignable");
  assert.equal(getScheduledJob(job.id)!.status, "cancelled");
});

test("a claim that never recorded its run goes back to scheduled after the grace, never done", () => {
  const backdate = (id: string) => getDb().prepare("UPDATE scheduled_jobs SET updated_at = 0 WHERE id = ?").run(id);
  const once = createJob({ fireAt: Date.now() + 60_000, summonRequest: { agentId: "dev", prompt: "lost claim" } });
  updateScheduledJob(once.id, { status: "firing" });
  backdate(once.id);
  reconcileFiring(getScheduledJob(once.id)!);
  assert.equal(getScheduledJob(once.id)!.status, "pending");

  const series = daily("lost claim series");
  updateScheduledJob(series.id, { status: "firing" });
  backdate(series.id);
  reconcileFiring(getScheduledJob(series.id)!);
  assert.equal(getScheduledJob(series.id)!.status, "pending");
});
