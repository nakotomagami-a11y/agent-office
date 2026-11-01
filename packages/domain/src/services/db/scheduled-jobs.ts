import { getDb } from "./connection";
import type { ScheduledJob, ScheduleRepeatEvery, ScheduledJobStatus, SummonRequest } from "../../types/index";
import { SCHEDULE_REPEAT_EVERY } from "../../config/schedules";

interface ScheduledJobRow {
  id: string; fire_at: number; summon_request: string; reason: string; label: string;
  status: string; attention: string | null; attempts: number; fired_run_id: string | null;
  repeat_every: string | null; repeat_anchor: number | null;
  created_at: number; updated_at: number;
}

function rowToScheduledJob(row: ScheduledJobRow): ScheduledJob {
  return {
    id: row.id,
    fireAt: row.fire_at,
    summonRequest: JSON.parse(row.summon_request) as SummonRequest,
    reason: row.reason as ScheduledJob["reason"],
    label: row.label,
    status: row.status as ScheduledJob["status"],
    attention: (row.attention ?? undefined) as ScheduledJob["attention"],
    attempts: row.attempts,
    firedRunId: row.fired_run_id ?? undefined,
    ...(row.repeat_every && (SCHEDULE_REPEAT_EVERY as readonly string[]).includes(row.repeat_every) && row.repeat_anchor !== null
      ? { repeat: { every: row.repeat_every as ScheduleRepeatEvery, anchorAt: row.repeat_anchor } }
      : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertScheduledJob(job: ScheduledJob): void {
  getDb().prepare(`
    INSERT INTO scheduled_jobs (id, fire_at, summon_request, reason, label, status, attention, attempts, fired_run_id, repeat_every, repeat_anchor, created_at, updated_at)
    VALUES (@id, @fireAt, @summonRequest, @reason, @label, @status, @attention, @attempts, @firedRunId, @repeatEvery, @repeatAnchor, @createdAt, @updatedAt)
  `).run({
    id: job.id, fireAt: job.fireAt, summonRequest: JSON.stringify(job.summonRequest),
    reason: job.reason, label: job.label, status: job.status, attention: job.attention ?? null,
    attempts: job.attempts, firedRunId: job.firedRunId ?? null,
    repeatEvery: job.repeat?.every ?? null, repeatAnchor: job.repeat?.anchorAt ?? null, createdAt: job.createdAt, updatedAt: job.updatedAt,
  });
}

export type ScheduledJobPatch = Partial<Pick<ScheduledJob, "fireAt" | "summonRequest" | "label" | "status" | "attention" | "attempts" | "firedRunId">>;

export function updateScheduledJob(id: string, patch: ScheduledJobPatch, expectStatus?: ScheduledJobStatus): boolean {
  const sets: string[] = ["updated_at = @updatedAt"];
  const params: Record<string, unknown> = { id, updatedAt: Date.now(), expectStatus: expectStatus ?? null };
  if (patch.fireAt !== undefined) { sets.push("fire_at = @fireAt"); params.fireAt = patch.fireAt; }
  if (patch.summonRequest !== undefined) { sets.push("summon_request = @summonRequest"); params.summonRequest = JSON.stringify(patch.summonRequest); }
  if (patch.label !== undefined) { sets.push("label = @label"); params.label = patch.label; }
  if (patch.status !== undefined) { sets.push("status = @status"); params.status = patch.status; }
  if ("attention" in patch) { sets.push("attention = @attention"); params.attention = patch.attention ?? null; }
  if (patch.attempts !== undefined) { sets.push("attempts = @attempts"); params.attempts = patch.attempts; }
  if ("firedRunId" in patch) { sets.push("fired_run_id = @firedRunId"); params.firedRunId = patch.firedRunId ?? null; }
  const where = expectStatus ? "id = @id AND status = @expectStatus" : "id = @id";
  return getDb().prepare(`UPDATE scheduled_jobs SET ${sets.join(", ")} WHERE ${where}`).run(params).changes > 0;
}

export function getScheduledJob(id: string): ScheduledJob | null {
  const row = getDb().prepare("SELECT * FROM scheduled_jobs WHERE id = ?").get(id) as ScheduledJobRow | undefined;
  return row ? rowToScheduledJob(row) : null;
}

/** All jobs the UI cares about: everything except cancelled, newest fire first. */
export function listScheduledJobs(): ScheduledJob[] {
  const rows = getDb()
    .prepare("SELECT * FROM scheduled_jobs WHERE status != 'cancelled' ORDER BY fire_at ASC")
    .all() as ScheduledJobRow[];
  return rows.map(rowToScheduledJob);
}

/** Jobs the scheduler tick must act on: pending (due-checked in caller) or firing (outcome-checked). */
export function listActiveScheduledJobs(): ScheduledJob[] {
  const rows = getDb()
    .prepare("SELECT * FROM scheduled_jobs WHERE status IN ('pending', 'firing') ORDER BY fire_at ASC")
    .all() as ScheduledJobRow[];
  return rows.map(rowToScheduledJob);
}
