import { getDb } from "./connection";
import { isPidAlive } from "../infra/pid";
import { log } from "../infra/log";

export type LoopName = "scheduler" | "orphan-shells";

// Every tick by the owner refreshes updated_at. Windows reuses pids quickly, so
// "owner pid is alive" alone could lock the loops out behind an unrelated process.
const STALE_MS = 90_000;

const leaseKey = (loop: LoopName) => `_loop_owner:${loop}`;

/** Loops that act on rows any server could act on (due scheduled jobs, shells whose
 *  run's server died) run in one process only: whoever holds this lease. Taken over
 *  when the owner is dead or has not ticked for STALE_MS. */
export function holdLoopLease(
  loop: LoopName,
  pid: number = process.pid,
  alive: (pid: number) => boolean = isPidAlive,
  now: number = Date.now(),
): boolean {
  const db = getDb();
  return db.transaction((): boolean => {
    const row = db.prepare("SELECT value, updated_at FROM ui_settings WHERE key = ?")
      .get(leaseKey(loop)) as { value: string; updated_at: number } | undefined;
    const owner = Number(row?.value);
    const heldElsewhere = row !== undefined && owner !== pid && Number.isInteger(owner) && owner > 0
      && now - row.updated_at < STALE_MS && alive(owner);
    if (heldElsewhere) return false;
    db.prepare(`
      INSERT INTO ui_settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
    `).run(leaseKey(loop), String(pid), now);
    if (owner !== pid) log.info("loops.lease_acquired", { loop, pid, previous: row?.value ?? null });
    return true;
  }).immediate();
}

/** On exit, so the next server does not wait out STALE_MS. Never touches another pid's lease. */
export function releaseLoopLeases(pid: number = process.pid): void {
  getDb().prepare("DELETE FROM ui_settings WHERE key LIKE '\\_loop\\_owner:%' ESCAPE '\\' AND value = ?").run(String(pid));
}
