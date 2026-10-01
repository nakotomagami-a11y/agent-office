/**
 * The cleanup service had ZERO test references while owning 10 destructive SQL
 * statements and 4 `rmSync` calls behind buttons in the Performance tab.
 *
 * Both run-deleting paths were broken by the same cause and neither could ever
 * have worked on real data:
 *
 *   - `wipeOrphanedRuns` deleted runs without their children, so it threw
 *     `FOREIGN KEY constraint failed` for any crashed run that had messages —
 *     i.e. all of them. It sits behind NO confirmation dialog.
 *   - `everything` deleted `messages` and `tool_calls` first but not
 *     `background_shells`, which was added later, so it threw whenever a
 *     background shell had ever been tracked.
 *
 * `everything` also cleared transcripts and drafts BEFORE opening its
 * transaction, so the rollback left a partial wipe behind and reported total
 * failure. That ordering is pinned below.
 *
 *   pnpm --filter @agent-office/domain test
 */
import assert from "node:assert";
import { test } from "node:test";
import Database from "better-sqlite3";
import { createSchema } from "../db/migrations";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { everything, wipeOrphanedRuns, isKind, RUN_CHILD_TABLES } from "./cleanup";

function freshDb(): Database.Database {
  const mem = new Database(":memory:");
  // The production pragma. Without it every assertion here is vacuous: the
  // bug IS the constraint, so a db that does not enforce it cannot see it.
  mem.pragma("foreign_keys = ON");
  createSchema(mem);
  globalThis.__agentOfficeDb = mem;
  return mem;
}

function seedRun(db: Database.Database, id: string, status = "done", exitCode: number | null = 0): void {
  db.prepare(
    `INSERT INTO runs (id, agent_id, agent_name, instance_id, status, exit_code, prompt, output, model, effort, started_at)
     VALUES (?, 'dev', 'Dev', 'default', ?, ?, 'p', '', 'm', 'high', 1)`,
  ).run(id, status, exitCode);
}

/** One child row in every table that holds a FK to `runs`. */
function seedChildren(db: Database.Database, runId: string): void {
  db.prepare("INSERT INTO messages (id, run_id, agent_id, role, content, ts) VALUES (?, ?, 'dev', 'user', 'hi', 1)")
    .run(`m_${runId}`, runId);
  db.prepare("INSERT INTO tool_calls (id, run_id, name, input, ts) VALUES (?, ?, 'Bash', '{}', 1)")
    .run(`t_${runId}`, runId);
  db.prepare(
    "INSERT INTO background_shells (id, run_id, agent_id, agent_name, pid, command, started_at) VALUES (?, ?, 'dev', 'Dev', 999, 'sleep 1', 1)",
  ).run(`b_${runId}`, runId);
}

const count = (db: Database.Database, t: string): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;

// --- the catalog must not be hand-maintained --------------------------------

test("RUN_CHILD_TABLES matches every FK into runs that the schema declares", () => {
  // The bug was a table added without updating the delete order. Deriving the
  // truth from the schema means the next one fails HERE, not in production.
  const db = freshDb();
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
    .map((r) => r.name);
  const referencing = tables.filter((t) =>
    (db.prepare(`PRAGMA foreign_key_list(${JSON.stringify(t)})`).all() as Array<{ table: string; from: string }>)
      .some((fk) => fk.table === "runs" && fk.from === "run_id"),
  );
  assert.deepEqual(
    [...referencing].sort(),
    [...RUN_CHILD_TABLES].sort(),
    "a table gained a FK to runs without being added to RUN_CHILD_TABLES",
  );
});

// --- wipeOrphanedRuns -------------------------------------------------------

test("an orphaned run is wiped together with its children", () => {
  const db = freshDb();
  seedRun(db, "crashed", "error", -1);
  seedChildren(db, "crashed");

  const r = wipeOrphanedRuns();

  assert.equal(r.detail?.runs, 1);
  assert.equal(count(db, "runs"), 0);
  for (const t of RUN_CHILD_TABLES) assert.equal(count(db, t), 0, `${t} rows outlived their run`);
});

test("a completed run and its children are never touched by the orphan sweep", () => {
  // The guarantee the feature exists for: analytics history survives.
  const db = freshDb();
  seedRun(db, "good", "done", 0);
  seedChildren(db, "good");
  seedRun(db, "crashed", "error", -1);
  seedChildren(db, "crashed");

  wipeOrphanedRuns();

  assert.equal(count(db, "runs"), 1);
  for (const t of RUN_CHILD_TABLES) assert.equal(count(db, t), 1, `${t} lost a row belonging to a good run`);
});

test("the orphan sweep is a no-op when there is nothing orphaned", () => {
  const db = freshDb();
  seedRun(db, "good", "done", 0);
  seedChildren(db, "good");
  assert.equal(wipeOrphanedRuns().cleared, 0);
  assert.equal(count(db, "runs"), 1);
});

// --- everything -------------------------------------------------------------

test("everything() wipes the db even when a background shell is tracked", () => {
  // The exact shape that threw: background_shells was added to the schema and
  // never added to the delete order.
  const db = freshDb();
  seedRun(db, "r1");
  seedChildren(db, "r1");
  db.prepare("INSERT INTO transcripts (agent_id, instance_id, items, updated_at) VALUES ('dev', 'default', '[]', 1)").run();

  const r = everything();

  assert.equal(count(db, "runs"), 0);
  for (const t of RUN_CHILD_TABLES) assert.equal(count(db, t), 0);
  assert.ok(r.cleared > 0);
});

test("everything() leaves nothing behind when the db half fails", () => {
  // Transcripts were cleared BEFORE the transaction opened, so a failure
  // inside it rolled back the runs and kept the transcripts deleted: a
  // partial wipe the user was told had failed. Simulated by making the final
  // statement fail — the whole db half must be atomic.
  const db = freshDb();
  seedRun(db, "r1");
  seedChildren(db, "r1");
  db.prepare("INSERT INTO transcripts (agent_id, instance_id, items, updated_at) VALUES ('dev', 'default', '[]', 1)").run();
  db.exec("DROP TABLE pipelines"); // the last DELETE in the transaction

  assert.throws(() => everything());

  assert.equal(count(db, "transcripts"), 1, "transcripts were wiped despite the rollback");
  assert.equal(count(db, "runs"), 1, "runs were wiped despite the rollback");
});

// --- filesystem sweeps ------------------------------------------------------

test("an unreadable entry is skipped, not fatal to the whole sweep", () => {
  // `statSync` on a broken symlink throws ENOENT. Unguarded inside a readdir
  // loop that is itself inside `everything()`, that abandons the remaining
  // files AND every db-independent step after it — with no transaction to
  // roll the earlier deletions back.
  const dir = mkdtempSync(join(tmpdir(), "ao-cleanup-"));
  try {
    const dangling = join(dir, "gone.memory.md");
    symlinkSync(join(dir, "does-not-exist"), dangling);
    assert.equal(isKind(dangling, "file"), false, "a broken symlink must not throw");
    assert.equal(isKind(dangling, "dir"), false);

    const real = join(dir, "real.memory.md");
    writeFileSync(real, "x");
    assert.equal(isKind(real, "file"), true, "a real file must still be seen");
    assert.equal(isKind(dir, "dir"), true);
    assert.equal(isKind(real, "dir"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
