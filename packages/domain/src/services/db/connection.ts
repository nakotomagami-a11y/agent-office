import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { DB_PATH, APP_STATE_DIR } from "../infra/paths";
import { createSchema, migrateFromJsonl } from "./migrations";

declare global {
  // eslint-disable-next-line no-var
  var __agentOfficeDb: Database.Database | undefined;
}

/**
 * Locate the prebuilt better-sqlite3 native addon in the packaged Tauri bundle.
 *
 * In the standalone server bundle the builder inlines better-sqlite3's JS, so
 * its `bindings` helper searches for the `.node` relative to the bundled chunk
 * (e.g. `<server>/apps/web/build/Release/...`) instead of node_modules, and
 * fails with "Could not locate the bindings file". We ship the addon at
 * `<server>/node_modules/better-sqlite3/build/Release/better_sqlite3.node`;
 * walk up from cwd to find it and pass it to better-sqlite3 explicitly.
 *
 * Returns undefined in dev / `next start` (nothing matches), so those runtimes
 * fall back to better-sqlite3's normal resolution and are unaffected.
 */
function resolveNativeBinding(): string | undefined {
  const rel = join("node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, rel);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function getDb(): Database.Database {
  if (globalThis.__agentOfficeDb) return globalThis.__agentOfficeDb;
  if (!existsSync(APP_STATE_DIR)) mkdirSync(APP_STATE_DIR, { recursive: true });
  const nativeBinding = resolveNativeBinding();
  const db = nativeBinding ? new Database(DB_PATH, { nativeBinding }) : new Database(DB_PATH);
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
