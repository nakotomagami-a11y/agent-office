/**
 * Self-check for orphan-run reaping. Run against a throwaway HOME:
 *   HOME=$(mktemp -d) ~/.bun/bin/bun packages/domain/src/services/db.orphan-reap.test.ts
 *
 * Regression guard for: a `next dev` restart mid-run opened the DB in a new
 * process, blanket-marked every status='running' row as error/-1, and killed
 * agents that the *previous* still-live worker was happily driving.
 */
import assert from "node:assert";
import { getDb, insertRun, isPidAlive, isRunOrphaned } from "./db";

function reopen(): void {
  globalThis.__agentOfficeDb?.close();
  globalThis.__agentOfficeDb = undefined;
  getDb(); // triggers reapOrphanedRuns
}

function seed(id: string, ownerPid: number | null): void {
  insertRun({
    id, agentId: "developer", agentName: "Developer", instanceId: "i1",
    status: "running", prompt: "p", model: "opus", effort: "high",
    startedAt: Date.now() - 5_000,
  });
  getDb().prepare("UPDATE runs SET owner_pid=@p WHERE id=@id").run({ p: ownerPid, id });
}

function statusOf(id: string): { status: string; exit_code: number | null } {
  return getDb().prepare("SELECT status, exit_code FROM runs WHERE id=@id").get({ id }) as never;
}

// A pid that cannot exist: kernel pid_max is at most 2^22.
const DEAD_PID = 4_194_305;

assert.equal(isPidAlive(process.pid), true, "own pid must read as alive");
assert.equal(isPidAlive(DEAD_PID), false, "impossible pid must read as dead");
assert.equal(isPidAlive(null), false, "legacy NULL owner_pid counts as orphaned");

seed("alive", process.pid);
seed("dead", DEAD_PID);
seed("legacy", null);

assert.equal(isRunOrphaned("alive"), false);
assert.equal(isRunOrphaned("dead"), true);
assert.equal(isRunOrphaned("legacy"), true);

reopen();

// The whole point: a run owned by a live process survives another process
// opening the DB. Before the fix this row came back error/-1.
assert.deepEqual(statusOf("alive"), { status: "running", exit_code: null });
assert.deepEqual(statusOf("dead"), { status: "error", exit_code: -1 });
assert.deepEqual(statusOf("legacy"), { status: "error", exit_code: -1 });

// A finished run is never touched by the reaper.
assert.equal(isRunOrphaned("dead"), false, "already-error rows are not re-reaped");

console.log("ok - orphan reaping is scoped to dead owner processes");
