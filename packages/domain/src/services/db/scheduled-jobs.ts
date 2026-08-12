import { getDb } from "./connection";
import type { ScheduledJob, SummonRequest } from "../../types/index";

interface ScheduledJobRow {
  id: string; fire_at: number; summon_request: string; reason: string; label: string;
  status: string; attention: string | null; attempts: number; fired_run_id: string | null;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertScheduledJob(job: ScheduledJob): void {
  getDb().prepare(`
    INSERT INTO scheduled_jobs (id, fire_at, summon_request, reason, label, status, attention, attempts, fired_run_id, created_at, updated_at)
    VALUES (@id, @fireAt, @summonRequest, @reason, @label, @status, @attention, @attempts, @firedRunId, @createdAt, @updatedAt)
  `).run({
    id: job.id, fireAt: job.fireAt, summonRequest: JSON.stringify(job.summonRequest),
    reason: job.reason, label: job.label, status: job.status, attention: job.attention ?? null,
    attempts: job.attempts, firedRunId: job.firedRunId ?? null, createdAt: job.createdAt, updatedAt: job.updatedAt,
  });
}

export type ScheduledJobPatch = Partial<Pick<ScheduledJob, "fireAt" | "summonRequest" | "label" | "status" | "attention" | "attempts" | "firedRunId">>;

export function updateScheduledJob(id: string, patch: ScheduledJobPatch): void {
  const sets: string[] = ["updated_at = @updatedAt"];
  const params: Record<string, unknown> = { id, updatedAt: Date.now() };
  if (patch.fireAt !== undefined) { sets.push("fire_at = @fireAt"); params.fireAt = patch.fireAt; }
  if (patch.summonRequest !== undefined) { sets.push("summon_request = @summonRequest"); params.summonRequest = JSON.stringify(patch.summonRequest); }
  if (patch.label !== undefined) { sets.push("label = @label"); params.label = patch.label; }
  if (patch.status !== undefined) { sets.push("status = @status"); params.status = patch.status; }
  if (patch.attention !== undefined) { sets.push("attention = @attention"); params.attention = patch.attention ?? null; }
  if (patch.attempts !== undefined) { sets.push("attempts = @attempts"); params.attempts = patch.attempts; }
  if (patch.firedRunId !== undefined) { sets.push("fired_run_id = @firedRunId"); params.firedRunId = patch.firedRunId ?? null; }
  getDb().prepare(`UPDATE scheduled_jobs SET ${sets.join(", ")} WHERE id = @id`).run(params);
}

export function getScheduledJob(id: string): ScheduledJob | null {
  const row = getDb().prepare("SELECT * FROM scheduled_jobs WHERE id = ?").get(id) as ScheduledJobRow | undefined;
  return row ? rowToScheduledJob(row) : null;
}

export function deleteScheduledJob(id: string): void {
  getDb().prepare("DELETE FROM scheduled_jobs WHERE id = ?").run(id);
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
