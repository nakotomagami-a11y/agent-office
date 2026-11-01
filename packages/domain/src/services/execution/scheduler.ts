import { randomUUID } from "node:crypto";
import type { ScheduledJob, ScheduleRepeat, ScheduleRepeatEvery, SummonRequest } from "../../types/index";
import * as db from "../db";
import { isLiveServer } from "../infra/discovery";
import { log } from "../infra/log";
import { emitAppEvent } from "../infra/events";
import { adoptScheduledRun } from "./conversation";
import { productionConversationRunner } from "./conversation-runner";
import * as runs from "./runs";
import { SCHEDULE_MAX_ATTEMPTS, SCHEDULE_STALE_HOURS } from "../../config/schedules";
import { nextOccurrence } from "./schedule-recurrence";
import { startSummonRun, summonTargetExists } from "./summon-run";

/** Writes only if the row is still in the status `job` was read in (a cancel or a racing tick wins),
 *  then notifies the schedules list over SSE. Returns whether it wrote. */
function updateJob(job: ScheduledJob, patch: Parameters<typeof db.updateScheduledJob>[1]): boolean {
  const wrote = db.updateScheduledJob(job.id, patch, job.status);
  if (wrote) emitAppEvent("schedules:changed");
  else log.info("scheduler.cas_lost", { jobId: job.id, expected: job.status });
  return wrote;
}

/** Statuses a user action (run now, reassign) may act on. */
const isActionable = (job: ScheduledJob) => job.status === "pending" || job.status === "needs-attention";

const TICK_MS = 30_000;
const STALE_MS = SCHEDULE_STALE_HOURS * 60 * 60 * 1000;
/** A job is claimed (`firing`) before its run spawns; until the run id lands it has none. */
const CLAIM_GRACE_MS = 5 * 60 * 1000;

declare global {
  var __agentOfficeSchedulerTimer: ReturnType<typeof setInterval> | undefined;
}

function instanceKey(agentId: string, instanceId?: string): string {
  return `${agentId}|${instanceId ?? "default"}`;
}

/** Is a run for this job's target already live? Don't fire a second (Q6.1). */
function instanceBusy(req: SummonRequest): boolean {
  const key = instanceKey(req.agentId, req.instanceId);
  if (runs.getRunningRuns().some((r) => instanceKey(r.agentId, r.instanceId) === key)) return true;
  return db.runningOwnerPidsForInstance(req.agentId, req.instanceId ?? "default")
    .some((pid) => pid !== process.pid && isLiveServer(pid));
}

/** After the slot just run too, so "run now" at 08:00 on a 09:00 daily doesn't run again at 09:00. */
function rearm(job: ScheduledJob, repeat: ScheduleRepeat): void {
  const fireAt = nextOccurrence(repeat, Math.max(Date.now(), job.fireAt));
  updateJob(job, {
    status: "pending",
    fireAt,
    attempts: 0,
    attention: undefined,
    firedRunId: undefined,
    summonRequest: { ...job.summonRequest, resumeSessionId: undefined },
  });
  log.info("scheduler.rearmed", { jobId: job.id, fireAt });
}

function finish(job: ScheduledJob): void {
  if (job.repeat) return rearm(job, job.repeat);
  updateJob(job, { status: "done" });
}

function markAttention(job: ScheduledJob, attention: ScheduledJob["attention"]): void {
  updateJob(job, { status: "needs-attention", attention });
  log.info("scheduler.needs_attention", { jobId: job.id, attention });
}

/** Fire a due pending job. `bypassStale` is set by an explicit "run anyway". Exported for tests. */
export async function fireDue(job: ScheduledJob, now: number, bypassStale = false): Promise<void> {
  if (!bypassStale && now - job.fireAt > STALE_MS) {
    if (job.repeat) return rearm(job, job.repeat);
    return markAttention(job, "stale");
  }
  if (!summonTargetExists(job.summonRequest)) return markAttention(job, "missing-instance");
  if (instanceBusy(job.summonRequest)) return; // hold to next tick
  // Claim before spawning, so a racing tick, "run now" or cancel cannot start a second run.
  if (!updateJob(job, { status: "firing" })) return;
  const claimed: ScheduledJob = { ...job, status: "firing" };
  const release = () => void updateJob(claimed, { status: job.status });

  const result = await startSummonRun(job.summonRequest).catch((err: unknown) => {
    release();
    throw err;
  });
  if ("error" in result) {
    // Claude temporarily unavailable, or a chat took the seat after instanceBusy → retry next tick.
    // Anything else (bad cwd, etc.) is not self-healing, so surface it for the user to reassign/cancel.
    if (result.error.code === "claude_unavailable" || result.error.code === "already_running") {
      log.info("scheduler.fire_deferred", { jobId: job.id, reason: result.error.message });
      return release();
    }
    log.warn("scheduler.fire_failed", { jobId: job.id, code: result.error.code, message: result.error.message });
    // Permanent: the default copy tells the user to reassign, which cannot help.
    return markAttention(claimed, result.error.code === "permission_bridge_missing"
      ? "bridge-missing" : "missing-instance");
  }

  updateJob(claimed, { firedRunId: result.runId });
  log.info("scheduler.fired", { jobId: job.id, runId: result.runId, reason: job.reason });
  const { conversationId, resumeSessionId } = job.summonRequest;
  if (!conversationId) return;
  // Best-effort: the run is live either way, and a throw here must not re-fire the job.
  await adoptScheduledRun(conversationId, result.runId, resumeSessionId ?? null, productionConversationRunner).catch((err) => {
    log.warn("scheduler.adopt_failed", { jobId: job.id, runId: result.runId, message: err instanceof Error ? err.message : String(err) });
  });
}

/** A fired job's run has an outcome — mark done, or reschedule if re-limited. Exported for tests. */
export function reconcileFiring(job: ScheduledJob): void {
  if (!job.firedRunId) {
    // A claim that never recorded its run (crash, throw): unknown whether it ran, so back to pending, never
    // "done". The stale check then catches it up within 12h, or parks / skips it after.
    if (Date.now() - job.updatedAt >= CLAIM_GRACE_MS) updateJob(job, { status: "pending" });
    return;
  }
  const outcome = db.getRunOutcome(job.firedRunId);
  if (!outcome || outcome.status === "running") return; // still running or gone
  // Retrying cannot help until the user fixes the provider, and "done" would hide that it never ran.
  if (db.getRun(job.firedRunId)?.errorCode === "provider_unavailable") return markAttention(job, "provider-unavailable");

  const resetsAt = outcome.rateLimitedResetsAt; // unix seconds, set only on a hard limit
  if (resetsAt) {
    if (job.attempts + 1 > SCHEDULE_MAX_ATTEMPTS) return markAttention(job, "retry-exceeded");
    // Resume the *latest* session on the next fire so context carries forward.
    const resumeSessionId = db.getRun(job.firedRunId)?.sessionId ?? job.summonRequest.resumeSessionId;
    updateJob(job, {
      status: "pending",
      fireAt: resetsAt * 1000,
      attempts: job.attempts + 1,
      firedRunId: undefined,
      summonRequest: { ...job.summonRequest, resumeSessionId },
    });
    log.info("scheduler.rescheduled", { jobId: job.id, attempt: job.attempts + 1, fireAt: resetsAt * 1000 });
    return;
  }
  finish(job);
}

let ticking = false;
async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    if (!db.holdLoopLease("scheduler")) return; // another live server fires due jobs
    const now = Date.now();
    for (const { id } of db.listActiveScheduledJobs()) {
      const job = db.getScheduledJob(id); // fresh: an earlier job's await may have outlived a cancel
      if (!job) continue;
      if (job.status === "firing") { reconcileFiring(job); continue; }
      if (job.status !== "pending" || job.fireAt > now) continue;
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
  repeat?: ScheduleRepeatEvery;
}

export function createJob(input: CreateJobInput): ScheduledJob {
  const now = Date.now();
  const repeat: ScheduleRepeat | undefined = input.repeat ? { every: input.repeat, anchorAt: input.fireAt } : undefined;
  const job: ScheduledJob = {
    id: randomUUID(),
    // `- 1`: nextOccurrence is strictly-after, and a first time of exactly now (or the anchor itself) counts.
    fireAt: repeat ? nextOccurrence(repeat, Math.max(input.fireAt, now) - 1) : input.fireAt,
    summonRequest: input.summonRequest,
    reason: input.reason ?? "manual",
    label: input.label ?? defaultLabel(input.summonRequest),
    status: "pending",
    attempts: 0,
    ...(repeat ? { repeat } : {}),
    createdAt: now,
    updatedAt: now,
  };
  db.insertScheduledJob(job);
  log.info("scheduler.created", { jobId: job.id, fireAt: job.fireAt, reason: job.reason, repeat: job.repeat?.every });
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
export function reassignJob(
  id: string,
  target: { agentId?: string; projectId?: string; instanceId?: string },
): ScheduledJob | null | "not_reassignable" {
  const job = db.getScheduledJob(id);
  if (!job) return null;
  if (!isActionable(job)) return "not_reassignable";
  const { conversationId, resumeSessionId, ...rest } = job.summonRequest;
  const retargeted = (target.agentId !== undefined && target.agentId !== job.summonRequest.agentId)
    || (target.projectId !== undefined && (target.projectId || null) !== (job.summonRequest.projectId || null))
    || (target.instanceId !== undefined && (target.instanceId || "default") !== (job.summonRequest.instanceId || "default"));
  const summonRequest: SummonRequest = {
    ...(retargeted ? rest : { ...rest, conversationId, resumeSessionId }),
    ...(target.agentId ? { agentId: target.agentId } : {}),
    ...(target.projectId !== undefined ? { projectId: target.projectId } : {}),
    ...(target.instanceId !== undefined ? { instanceId: target.instanceId } : {}),
  };
  const patch = { summonRequest, status: "pending" as const, attention: undefined, label: defaultLabel(summonRequest) };
  if (!db.updateScheduledJob(id, patch, job.status)) return "not_reassignable";
  return db.getScheduledJob(id);
}

/** Fire a job immediately, bypassing the staleness cap ("run anyway" — Q5 modal). */
export async function runNow(id: string): Promise<ScheduledJob | null | "not_runnable"> {
  const job = db.getScheduledJob(id);
  if (!job) return null;
  if (!isActionable(job)) return "not_runnable";
  await fireDue(job, Date.now(), true);
  return db.getScheduledJob(id);
}
