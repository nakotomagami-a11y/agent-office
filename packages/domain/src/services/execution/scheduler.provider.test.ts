/**
 * A scheduled job whose run the provider refused is parked for the user, never marked done and
 * never retried: no retry can succeed until the provider is fixed.
 *
 *   pnpm --filter @agent-office/domain test src/services/execution/scheduler.provider.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sandbox = mkdtempSync(join(tmpdir(), "ao-scheduler-provider-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;

const { reconcileFiring } = await import("./scheduler");
const { startRun } = await import("./runs");
const store = await import("../providers/store");
const db = await import("../db");

function firingJob(firedRunId: string) {
  const job = {
    id: `job-${firedRunId}`, fireAt: 1, summonRequest: { agentId: "t", prompt: "hi" }, reason: "manual" as const,
    label: "t", status: "firing" as const, attempts: 0, firedRunId, createdAt: 1, updatedAt: 1,
  };
  db.insertScheduledJob(job);
  return job;
}

test("a refused run parks its job as provider-unavailable", () => {
  store.setSelection("openai", "chosen");
  const { runId } = startRun({ agentId: "t", agentName: "T", prompt: "hi", model: "m", effort: "e", args: ["-p"] });
  const job = firingJob(runId);
  reconcileFiring(job);
  const after = db.getScheduledJob(job.id);
  assert.deepStrictEqual([after?.status, after?.attention, after?.attempts], ["needs-attention", "provider-unavailable", 0]);
});

test("any other failed run still ends its job as done", () => {
  db.insertRun({ id: "plain-fail", agentId: "t", agentName: "T", status: "running", prompt: "hi", model: "m", effort: "e", startedAt: 1 });
  db.updateRun("plain-fail", { status: "error", output: "", tokensIn: 0, tokensOut: 0, costUsd: 0, durMs: 1, endedAt: 2, errorCode: "unknown" });
  const job = firingJob("plain-fail");
  reconcileFiring(job);
  assert.equal(db.getScheduledJob(job.id)?.status, "done");
});
