import assert from "node:assert";
import { test } from "node:test";
import Database from "better-sqlite3";
import { createSchema } from "./migrations";
import { holdLoopLease, releaseLoopLeases } from "./loop-lease";

const mem = new Database(":memory:");
createSchema(mem);
globalThis.__agentOfficeDb = mem;

const T0 = 1_000_000;

test("one server runs a loop; a second waits until the first is dead", () => {
  const alive = new Set([100, 200]);
  const isAlive = (pid: number) => alive.has(pid);

  assert.strictEqual(holdLoopLease("scheduler", 100, isAlive, T0), true, "first claimant takes the lease");
  assert.strictEqual(holdLoopLease("scheduler", 100, isAlive, T0 + 1000), true, "and keeps it");
  assert.strictEqual(holdLoopLease("scheduler", 200, isAlive, T0 + 2000), false, "a live, ticking owner is never displaced");
  assert.strictEqual(holdLoopLease("orphan-shells", 200, isAlive, T0 + 2000), true, "each loop has its own lease");

  alive.delete(100);
  assert.strictEqual(holdLoopLease("scheduler", 200, isAlive, T0 + 3000), true, "a dead owner's lease is taken over");
  assert.strictEqual(holdLoopLease("scheduler", 100, isAlive, T0 + 4000), false);
});

test("a pid that is alive but stopped ticking (pid reused) loses the lease", () => {
  const T1 = T0 + 1_000_000; // earlier tests' leases are stale by now
  const always = () => true;
  assert.strictEqual(holdLoopLease("scheduler", 300, always, T1), true);
  assert.strictEqual(holdLoopLease("scheduler", 400, always, T1 + 89_000), false, "still fresh");
  assert.strictEqual(holdLoopLease("scheduler", 400, always, T1 + 91_000), true, "stale heartbeat");
});

test("release drops only the caller's own leases", () => {
  holdLoopLease("scheduler", 500, () => false, T0);
  holdLoopLease("orphan-shells", 600, () => false, T0);
  releaseLoopLeases(500);
  const keys = mem.prepare("SELECT key, value FROM ui_settings WHERE key LIKE '\\_loop\\_owner:%' ESCAPE '\\' ORDER BY key").all();
  assert.deepStrictEqual(keys, [{ key: "_loop_owner:orphan-shells", value: "600" }]);
});

test("a garbage owner value does not lock the loops out", () => {
  mem.prepare("UPDATE ui_settings SET value = 'nope' WHERE key = '_loop_owner:orphan-shells'").run();
  assert.strictEqual(holdLoopLease("orphan-shells", 700, () => true, T0 + 1), true);
});
