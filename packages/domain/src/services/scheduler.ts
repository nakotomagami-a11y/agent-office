import { randomUUID } from "node:crypto";
import type { ScheduledJob, SummonRequest } from "../types/index";
import * as db from "./db";
import { log } from "./log";
import * as runs from "./runs";
import { startSummonRun, summonTargetExists } from "./summon-run";

const TICK_MS = 30_000;
/** Jobs more than this overdue don't auto-fire — they wait for the user (Q5). */
const STALE_MS = 12 * 60 * 60 * 1000;
/** Consecutive rate-limit reschedules before giving up (Q6.4). */
const MAX_ATTEMPTS = 5;

declare global {
  // eslint-disable-next-line no-var
  var __agentOfficeSchedulerTimer: ReturnType<typeof setInterval> | undefined;
}

function instanceKey(agentId: string, instanceId?: string): string {
  return `${agentId}|${instanceId ?? "default"}`;
}

/** Is a run for this job's target already live? Don't fire a second (Q6.1). */
function instanceBusy(req: SummonRequest): boolean {
  const key = instanceKey(req.agentId, req.instanceId);
  return runs.getRunningRuns().some((r) => instanceKey(r.agentId, r.instanceId) === key);
}

function markAttention(job: ScheduledJob, attention: ScheduledJob["attention"]): void {
  db.updateScheduledJob(job.id, { status: "needs-attention", attention });
  log.info("scheduler.needs_attention", { jobId: job.id, attention });
}

/** Fire a due pending job. `bypassStale` is set by an explicit "run anyway". */
async function fireDue(job: ScheduledJob, now: number, bypassStale = false): Promise<void> {
  if (!bypassStale && now - job.fireAt > STALE_MS) return markAttention(job, "stale");
  if (!summonTargetExists(job.summonRequest)) return markAttention(job, "missing-instance");
  if (instanceBusy(job.summonRequest)) return; // hold to next tick

  const result = await startSummonRun(job.summonRequest);
  if ("error" in result) {
    // Claude temporarily unavailable → retry next tick. Anything else (bad cwd,
    // etc.) is not self-healing, so surface it for the user to reassign/cancel.
    if (result.error.code === "claude_unavailable") {
      log.info("scheduler.fire_deferred", { jobId: job.id, reason: result.error.message });
      return;
    }
    log.warn("scheduler.fire_failed", { jobId: job.id, message: result.error.message });
    return markAttention(job, "missing-instance");
  }

  db.updateScheduledJob(job.id, { status: "firing", firedRunId: result.runId });
  log.info("scheduler.fired", { jobId: job.id, runId: result.runId, reason: job.reason });
}

/** A fired job's run has an outcome — mark done, or reschedule if re-limited. */
function reconcileFiring(job: ScheduledJob): void {
  if (!job.firedRunId) return void db.updateScheduledJob(job.id, { status: "done" });
  const outcome = db.getRunOutcome(job.firedRunId);
  if (!outcome || outcome.status === "running") return; // still running or gone

  const resetsAt = outcome.rateLimitedResetsAt; // unix seconds, set only on a hard limit
  if (resetsAt) {
    if (job.attempts + 1 > MAX_ATTEMPTS) return markAttention(job, "retry-exceeded");
    // Resume the *latest* session on the next fire so context carries forward.
    const resumeSessionId = db.getRun(job.firedRunId)?.sessionId ?? job.summonRequest.resumeSessionId;
    db.updateScheduledJob(job.id, {
      status: "pending",
      fireAt: resetsAt * 1000,
      attempts: job.attempts + 1,
      firedRunId: undefined,
      summonRequest: { ...job.summonRequest, resumeSessionId },
    });
    log.info("scheduler.rescheduled", { jobId: job.id, attempt: job.attempts + 1, fireAt: resetsAt * 1000 });
    return;
  }
  db.updateScheduledJob(job.id, { status: "done" });
}

let ticking = false;
async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const now = Date.now();
    for (const job of db.listActiveScheduledJobs()) {
      if (job.status === "firing") { reconcileFiring(job); continue; }
      if (job.fireAt > now) continue; // not due yet
      await fireDue(job, now);
    }
  } catch (err) {
    log.warn("scheduler.tick_error", { message: err instanceof Error ? err.message : String(err) });
  } finally {
    ticking = false;
  }
}

/** Start the server-side scheduler loop. Idempotent (survives HMR restarts). */
export function startScheduler(): void {
  if (globalThis.__agentOfficeSchedulerTimer) return;
  const timer = setInterval(() => { void tick(); }, TICK_MS);
  timer.unref();
  globalThis.__agentOfficeSchedulerTimer = timer;
  // Catch-up pass shortly after boot for jobs whose time passed while down.
  setTimeout(() => { void tick(); }, 5_000).unref();
  log.info("scheduler.started", { tickMs: TICK_MS });
}

// ─── Public API (used by /api/schedules routes) ───────────────────────────────

export interface CreateJobInput {
  fireAt: number;
  summonRequest: SummonRequest;
  reason?: ScheduledJob["reason"];
  label?: string;
}

export function createJob(input: CreateJobInput): ScheduledJob {
  const now = Date.now();
  const job: ScheduledJob = {
    id: randomUUID(),
    fireAt: input.fireAt,
    summonRequest: input.summonRequest,
    reason: input.reason ?? "manual",
    label: input.label ?? defaultLabel(input.summonRequest),
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };
  db.insertScheduledJob(job);
  log.info("scheduler.created", { jobId: job.id, fireAt: job.fireAt, reason: job.reason });
  return job;
}

function defaultLabel(req: SummonRequest): string {
  const snippet = req.prompt.trim().replace(/\s+/g, " ").slice(0, 80);
  return `${req.agentId}: ${snippet}`;
}

export function listJobs(): ScheduledJob[] {
  return db.listScheduledJobs();
}

export function cancelJob(id: string): boolean {
  if (!db.getScheduledJob(id)) return false;
  db.updateScheduledJob(id, { status: "cancelled" });
  return true;
}

/** Point a needs-attention job at a different agent/project/instance and re-arm it. */
export function reassignJob(id: string, target: { agentId?: string; projectId?: string; instanceId?: string }): ScheduledJob | null {
  const job = db.getScheduledJob(id);
  if (!job) return null;
  const summonRequest: SummonRequest = {
    ...job.summonRequest,
    ...(target.agentId ? { agentId: target.agentId } : {}),
    ...(target.projectId !== undefined ? { projectId: target.projectId } : {}),
    ...(target.instanceId !== undefined ? { instanceId: target.instanceId } : {}),
  };
  db.updateScheduledJob(id, { summonRequest, status: "pending", attention: undefined, label: defaultLabel(summonRequest) });
  return db.getScheduledJob(id);
}

/** Fire a job immediately, bypassing the staleness cap ("run anyway" — Q5 modal). */
export async function runNow(id: string): Promise<ScheduledJob | null> {
  const job = db.getScheduledJob(id);
  if (!job) return null;
  await fireDue(job, Date.now(), true);
  return db.getScheduledJob(id);
}
