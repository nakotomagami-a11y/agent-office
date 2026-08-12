import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { DB_PATH, APP_STATE_DIR } from "../paths";
import { createSchema, migrateFromJsonl } from "./migrations";

declare global {
  // eslint-disable-next-line no-var
  var __agentOfficeDb: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (globalThis.__agentOfficeDb) return globalThis.__agentOfficeDb;
  if (!existsSync(APP_STATE_DIR)) mkdirSync(APP_STATE_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  createSchema(db);
  migrateFromJsonl(db);
  reapOrphanedRuns(db);
  globalThis.__agentOfficeDb = db;
  return db;
}

/**
 * A run row is only orphaned if the process that spawned it is gone.
 *
 * This used to be a blanket `status='running' -> error` sweep, which killed
 * runs still being driven by a *live* sibling process. `next dev` restarting
 * mid-run is exactly that case: the new worker opens the DB and marks the old
 * worker's healthy, mid-task agents as failed, while the old worker keeps
 * streaming into the same DB file. The UI then attaches to the new worker,
 * finds no live run, and shows nothing at all.
 */
function reapOrphanedRuns(db: Database.Database): void {
  const now = Date.now();
  const running = db
    .prepare("SELECT id, owner_pid FROM runs WHERE status='running'")
    .all() as Array<{ id: string; owner_pid: number | null }>;
  const orphans = running.filter((r) => !isPidAlive(r.owner_pid)).map((r) => r.id);
  if (orphans.length > 0) {
    const mark = db.prepare(
      "UPDATE runs SET status='error', exit_code=-1, ended_at=@now, dur_ms=MAX(0, @now-started_at) WHERE id=@id AND status='running'"
    );
    db.transaction(() => { for (const id of orphans) mark.run({ now, id }); })();
  }
  // Same rule for pipelines: only the ones whose owning run is gone were
  // actually interrupted. A pipeline with any still-live run keeps going.
  db.prepare(`
    UPDATE pipelines SET status='error', ended_at=@now, interrupted=1
    WHERE status='running'
      AND NOT EXISTS (
        SELECT 1 FROM pipeline_steps s JOIN runs r ON r.id = s.run_id
        WHERE s.pipeline_id = pipelines.id AND r.status = 'running'
      )
  `).run({ now });
}

/**
 * `kill(pid, 0)` sends no signal - it only probes existence. ESRCH means gone,
 * EPERM means alive but owned by another user.
 *
 * ponytail: PIDs can be recycled, so a dead run whose PID got reused stays
 * "running" until the 4h wall-clock cap in runs.ts sweeps it. Swap for a
 * pid+boot-time pair if that ever bites.
 */
export function isPidAlive(pid: number | null | undefined): boolean {
  // NULL = row predates the owner_pid column; treat as orphaned (old behaviour).
  if (pid == null || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** True when the row says "running" but the process that owned it is gone. */
export function isRunOrphaned(id: string): boolean {
  const row = getDb()
    .prepare("SELECT status, owner_pid FROM runs WHERE id=@id")
    .get({ id }) as { status: string; owner_pid: number | null } | undefined;
  if (!row || row.status !== "running") return false;
  return !isPidAlive(row.owner_pid);
}
