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
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { linkTo } from "../infra/fs-links.test.support";

// everything() sweeps the default ~/.claude dirs — on a real profile it deleted
// installed skills. Own sandbox, set before any module resolves paths.
const sandbox = mkdtempSync(join(tmpdir(), "ao-cleanup-home-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox; // os.homedir() reads this on Windows, not HOME

const { createSchema } = await import("../db/migrations");
const { deleteRunsByAgent, deleteRunsForInstance } = await import("../db/runs");
const {
  everything, wipeOrphanedRuns, isKind, resetAgentMemoryFiles, clearSkillInstallCache, resetUiSettings,
  RUN_FK_REFS, PIPELINE_CHILD_TABLES, RunsLiveError,
} = await import("./cleanup");
const { liveRuns } = await import("../execution/runs/registry");
const { STALLED_START_MS } = await import("../execution/conversation");

const RUN_CHILD_TABLES = ["messages", "tool_calls", "background_shells"] as const;

function freshDb(): Database.Database {
  const mem = new Database(":memory:");
  // The production pragma. Without it every assertion here is vacuous: the
  // bug IS the constraint, so a db that does not enforce it cannot see it.
  mem.pragma("foreign_keys = ON");
  createSchema(mem);
  globalThis.__agentOfficeDb = mem;
  return mem;
}

function seedRun(db: Database.Database, id: string, status = "done", exitCode: number | null = 0, parent: string | null = null): void {
  db.prepare(
    `INSERT INTO runs (id, agent_id, agent_name, instance_id, status, exit_code, prompt, output, model, effort, started_at, parent_run_id)
     VALUES (?, 'dev', 'Dev', 'default', ?, ?, 'p', '', 'm', 'high', 1, ?)`,
  ).run(id, status, exitCode, parent);
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

const allTables = (db: Database.Database): string[] =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>)
    .map((r) => r.name);

const fks = (db: Database.Database, t: string) =>
  db.prepare(`PRAGMA foreign_key_list(${JSON.stringify(t)})`).all() as Array<{ table: string; from: string; on_delete: string }>;

// --- the catalog must not be hand-maintained --------------------------------

test("RUN_FK_REFS matches every FK into runs, whatever the column is called", () => {
  // The first version of this filtered on `fk.from === "run_id"`, so it could
  // not see `runs.parent_run_id` — a self-FK — and passed while the orphan
  // sweep still threw on exactly that. A name convention is not the schema.
  const db = freshDb();
  const refs = allTables(db).flatMap((t) =>
    fks(db, t).filter((fk) => fk.table === "runs").map((fk) => `${t}.${fk.from}`),
  );
  assert.deepEqual([...refs].sort(), [...RUN_FK_REFS].sort(),
    "a FK into runs appeared or vanished without updating RUN_FK_REFS");
});

test("PIPELINE_CHILD_TABLES matches every FK into pipelines", () => {
  const db = freshDb();
  const refs = allTables(db).flatMap((t) =>
    fks(db, t).filter((fk) => fk.table === "pipelines").map(() => t),
  );
  assert.deepEqual([...new Set(refs)].sort(), [...PIPELINE_CHILD_TABLES].sort());
});

test("no FK into runs or pipelines declares ON DELETE, so order stays load-bearing", () => {
  // If one ever gains CASCADE the helpers become redundant — but silently.
  const db = freshDb();
  for (const t of allTables(db)) {
    for (const fk of fks(db, t)) {
      if (fk.table !== "runs" && fk.table !== "pipelines") continue;
      assert.equal(fk.on_delete, "NO ACTION", `${t}.${fk.from} gained ON DELETE ${fk.on_delete}`);
    }
  }
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
    linkTo(join(dir, "does-not-exist"), dangling);
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

// --- the shapes review round 1 missed --------------------------------------

test("an orphaned parent is wiped while its completed sub-agent survives", () => {
  // The single most common shape in this product: an orchestrator that crashed
  // with a sub-agent that finished. `runs.parent_run_id` is a FK into `runs`
  // itself, so deleting the parent threw — the orphan button did nothing at
  // all. The sub-agent is real analytics data: the link is NULLed, not the row.
  const db = freshDb();
  seedRun(db, "parent", "error", -1);
  seedRun(db, "sub", "done", 0, "parent");

  assert.equal(wipeOrphanedRuns().detail?.runs, 1);

  const left = db.prepare("SELECT id, parent_run_id FROM runs").all() as Array<{ id: string; parent_run_id: string | null }>;
  assert.deepEqual(left, [{ id: "sub", parent_run_id: null }], "the sub-agent must survive, unparented");
});

test("an interrupted pipeline is wiped together with its steps", () => {
  // The other half of the same function, two lines below the fix, untouched by
  // review round 1: pipeline_steps -> pipelines is the identical FK order bug.
  const db = freshDb();
  db.prepare("INSERT INTO pipelines (id, status, created_at, interrupted) VALUES ('p1', 'error', 1, 1)").run();
  db.prepare("INSERT INTO pipeline_steps (pipeline_id, step_index, agent_id, status) VALUES ('p1', 0, 'dev', 'error')").run();

  assert.equal(wipeOrphanedRuns().detail?.pipelines, 1);
  assert.equal(count(db, "pipelines"), 0);
  assert.equal(count(db, "pipeline_steps"), 0);
});

test("everything() does not leave a conversation wedged on a deleted run", () => {
  // No FK here, so nothing throws — it wedges. `reconcile` reads a missing run
  // as "just spawned, not persisted yet" and returns early FOREVER, so every
  // later message queues behind a run that can never finish. The recovery
  // button would have manufactured the state it exists to clear.
  const db = freshDb();
  seedRun(db, "r1", "error", -1);
  db.prepare(
    "INSERT INTO conversations (id, agent_id, instance_id, status, active_run_id, created_at, updated_at) VALUES ('c1','dev','default','needs_attention','r1',1,1)",
  ).run();
  db.prepare("INSERT INTO queued_messages (id, conversation_id, text, position, created_at) VALUES ('q1','c1','hi',0,1)").run();
  // loop-runner.ts has the identical `if (!run) return` reconciler, AND
  // `idx_loops_active_run` is UNIQUE, so a stale row can also collide.
  db.prepare(
    `INSERT INTO loops (id, conversation_id, agent_id, instance_id, reviewer_agent_id, goal, phase, round,
       spent_usd, started_at, config_json, created_at, updated_at, active_run_id)
     VALUES ('l1','c1','dev','default','qa','g','working',1,0,1,'{}',1,1,'r1')`,
  ).run();

  everything();

  assert.equal(count(db, "runs"), 0);
  assert.equal(count(db, "conversations"), 0, "a conversation pointing at a deleted run is unusable");
  assert.equal(count(db, "queued_messages"), 0);
  assert.equal(count(db, "loops"), 0, "a loop pointing at a deleted run can never advance");
});

test("everything() refuses while a run is running anywhere, and deletes nothing", () => {
  // It deleted the running run's rows and the chat waiting on it: the run kept
  // streaming into rows that were gone, and its finish reached no conversation.
  const db = freshDb();
  seedRun(db, "live", "running", null);
  // Another server (desktop app and `pnpm server` side by side): its pid is alive.
  db.prepare("UPDATE runs SET owner_pid = ? WHERE id = 'live'").run(process.ppid);
  seedConversation(db, "c1", "running", "live");
  db.prepare("INSERT INTO transcripts (agent_id, instance_id, items, updated_at) VALUES ('dev', 'default', '[]', 1)").run();

  assert.throws(() => everything(), (e: unknown) => e instanceof RunsLiveError && e.count === 1);

  assert.equal(count(db, "runs"), 1);
  assert.equal(count(db, "conversations"), 1);
  assert.equal(count(db, "transcripts"), 1);
});

test("a ghost running row does not block erase: its server is dead, or it is ours and not live", () => {
  const db = freshDb();
  seedRun(db, "ghost-ours", "running", null);
  seedRun(db, "ghost-dead", "running", null);
  db.prepare("UPDATE runs SET owner_pid = ? WHERE id = 'ghost-ours'").run(process.pid);
  everything();
  assert.equal(count(db, "runs"), 0);
});

test("everything() refuses while a chat or loop is starting a run whose row is not written yet", () => {
  const db = freshDb();
  const now = Date.now();
  db.prepare(
    "INSERT INTO conversations (id, agent_id, instance_id, status, active_run_id, created_at, updated_at) VALUES ('c1','dev','default','running',NULL,?,?)",
  ).run(now, now);
  assert.throws(() => everything(), RunsLiveError);
  assert.equal(count(db, "conversations"), 1);

  db.prepare("UPDATE conversations SET updated_at = ?").run(now - STALLED_START_MS - 1000);
  seedLoop(db, "l1", null);
  db.prepare("UPDATE loops SET phase = 'authoring', updated_at = ?").run(now);
  assert.throws(() => everything(), RunsLiveError);

  db.prepare("UPDATE loops SET updated_at = ?").run(now - STALLED_START_MS - 1000);
  everything();
  assert.equal(count(db, "conversations"), 0, "a start that stalled long ago is not live");
});

test("everything() refuses while this server holds a live run its row doesn't show yet", () => {
  const db = freshDb();
  seedRun(db, "r1");
  liveRuns.set("spawning", { status: "running" } as unknown as Parameters<typeof liveRuns.set>[1]);
  try {
    assert.throws(() => everything(), RunsLiveError);
    assert.equal(count(db, "runs"), 1);
  } finally {
    liveRuns.delete("spawning");
  }
});

test("everything() clears pipeline steps and ui settings, keeping the migration sentinel", () => {
  // Both were deletable without failing a test: nothing seeded them.
  const db = freshDb();
  db.prepare("INSERT INTO pipelines (id, status, created_at, interrupted) VALUES ('p1','done',1,0)").run();
  db.prepare("INSERT INTO pipeline_steps (pipeline_id, step_index, agent_id, status) VALUES ('p1',0,'dev','done')").run();
  db.prepare("INSERT INTO ui_settings (key, value, updated_at) VALUES ('theme','dark',1)").run();
  db.prepare("INSERT INTO ui_settings (key, value, updated_at) VALUES ('_migrated','1',1)").run();

  everything();

  assert.equal(count(db, "pipeline_steps"), 0);
  const keys = (db.prepare("SELECT key FROM ui_settings").all() as Array<{ key: string }>).map((r) => r.key);
  assert.deepEqual(keys, ["_migrated"], "the sentinel must survive or the JSONL migration re-runs");
});

test("the orphan sweep has no bound-parameter ceiling", () => {
  // Binding one id per run threw `too many SQL variables` at 32767 — inside a
  // transaction, so the button became a clean no-op instead of working.
  const db = freshDb();
  const insert = db.prepare(
    "INSERT INTO runs (id, agent_id, agent_name, instance_id, status, exit_code, prompt, output, model, effort, started_at) VALUES (?, 'dev','Dev','default','error',-1,'p','','m','high',1)",
  );
  db.transaction(() => { for (let i = 0; i < 40_000; i += 1) insert.run(`r${i}`); })();

  assert.equal(wipeOrphanedRuns().detail?.runs, 40_000);
  assert.equal(count(db, "runs"), 0);
});

test("the memory sweep deletes only agent memory, and survives a broken symlink", () => {
  // `isKind` was tested in isolation, so swapping "file" for "dir" at the call
  // site silently cleared nothing and failed no test.
  const dir = mkdtempSync(join(tmpdir(), "ao-mem-"));
  try {
    writeFileSync(join(dir, "dev.memory.md"), "x");
    writeFileSync(join(dir, "keep.md"), "x");
    writeFileSync(join(dir, "_global.memory.md"), "x");
    mkdirSync(join(dir, "sub.memory.md"));
    linkTo(join(dir, "nope"), join(dir, "dangling.memory.md"));

    assert.equal(resetAgentMemoryFiles(dir).cleared, 1);
    const left = readdirSync(dir).sort();
    assert.deepEqual(left, ["_global.memory.md", "dangling.memory.md", "keep.md", "sub.memory.md"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A skill folder: `SKILL.md`, plus `.source.json` when the registry installed it. */
function skill(dir: string, name: string, body = "# skill", fromRegistry = false): void {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, "SKILL.md"), body);
  if (fromRegistry) writeFileSync(join(dir, name, ".source.json"), "{}");
}

test("the skill sweep deletes registry installs and keeps the user's own skills", () => {
  // It used to delete every folder ("they reinstall on next use"): a forged or
  // imported skill exists nowhere else, so it was simply gone.
  const dir = mkdtempSync(join(tmpdir(), "ao-skills-"));
  try {
    skill(dir, "from-registry", "# r", true);
    skill(dir, "forged-by-me");
    writeFileSync(join(dir, "index.json"), "{}");
    mkdirSync(join(dir, "_seeding-x-1"));
    linkTo(join(dir, "nope"), join(dir, "dangling"));

    assert.equal(clearSkillInstallCache(dir).cleared, 1);
    assert.deepEqual(readdirSync(dir).sort(), ["_seeding-x-1", "dangling", "forged-by-me", "index.json"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a bundled skill goes only while it is byte-identical to the bundle", () => {
  const dir = mkdtempSync(join(tmpdir(), "ao-skills-"));
  const bundle = mkdtempSync(join(tmpdir(), "ao-bundle-"));
  try {
    for (const name of ["pristine", "edited", "uninstalled"]) skill(bundle, name, `# ${name}`);
    skill(dir, "pristine", "# pristine");
    skill(dir, "edited", "# edited, with my changes");
    writeFileSync(join(dir, "_seeded.json"), '["edited","pristine","uninstalled"]');

    assert.equal(clearSkillInstallCache(dir, bundle).cleared, 1);
    assert.deepEqual(readdirSync(dir).sort(), ["_seeded.json", "edited"]);
    // Boot re-offers what the marker lacks: the deleted one, not the one the user uninstalled.
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "_seeded.json"), "utf8")), ["edited", "uninstalled"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(bundle, { recursive: true, force: true });
  }
});

test("without the bundle to compare against, no bundled skill is touched", () => {
  const dir = mkdtempSync(join(tmpdir(), "ao-skills-"));
  try {
    skill(dir, "pristine");
    writeFileSync(join(dir, "_seeded.json"), '["pristine"]');

    assert.equal(clearSkillInstallCache(dir, null).cleared, 0);
    assert.equal(readFileSync(join(dir, "_seeded.json"), "utf8"), '["pristine"]');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- the sibling delete paths ------------------------------------------------

test("deleting an agent's runs takes its children, including background shells", () => {
  // Three hand-rolled copies of the delete order shipped with the same two
  // omissions. They are user-reachable (delete an agent / an instance) and
  // threw the moment a background shell had been tracked or a sub-agent ran.
  const db = freshDb();
  seedRun(db, "parent", "done", 0);
  seedChildren(db, "parent");
  seedRun(db, "sub", "done", 0, "parent");

  assert.equal(deleteRunsByAgent("dev"), 2);
  assert.equal(count(db, "runs"), 0);
  for (const t of RUN_CHILD_TABLES) assert.equal(count(db, t), 0);
});

test("deleting an instance's runs leaves another instance untouched", () => {
  const db = freshDb();
  seedRun(db, "mine", "done", 0);
  seedChildren(db, "mine");
  db.prepare("UPDATE runs SET project_id = 'p1' WHERE id = 'mine'").run();
  db.prepare(
    "INSERT INTO runs (id, agent_id, agent_name, instance_id, project_id, status, exit_code, prompt, output, model, effort, started_at) VALUES ('other','dev','Dev','other','p1','done',0,'p','','m','high',1)",
  ).run();

  assert.equal(deleteRunsForInstance("p1", "default"), 1);
  assert.deepEqual(
    (db.prepare("SELECT id FROM runs").all() as Array<{ id: string }>).map((r) => r.id),
    ["other"],
  );
});

test("a scheduled job never outlives the run it fired", () => {
  // `reconcileFiring` does `if (!outcome || outcome.status === "running") return`
  // — a DELETED run is indistinguishable from a live one, so the job sticks in
  // `firing` forever. I wrongly called this cosmetic; review caught it.
  // `everything()` is the total nuke, so the jobs go; a SCOPED delete only
  // clears the pointer, which routes the job to the `!firedRunId -> done` path.
  const db = freshDb();
  seedRun(db, "fired", "done", 0);
  const job = (fired: string | null) =>
    db.prepare(
      `INSERT INTO scheduled_jobs (id, fire_at, summon_request, reason, status, attempts, fired_run_id, created_at, updated_at)
       VALUES ('j1', 1, '{}', 'manual', 'firing', 0, ?, 1, 1)`,
    ).run(fired);

  job("fired");
  deleteRunsByAgent("dev");
  assert.equal(
    (db.prepare("SELECT fired_run_id FROM scheduled_jobs WHERE id='j1'").get() as { fired_run_id: string | null }).fired_run_id,
    null,
    "a scoped delete must clear the pointer, or the job wedges in `firing`",
  );

  db.prepare("DELETE FROM scheduled_jobs").run();
  seedRun(db, "fired2", "done", 0);
  db.prepare(
    `INSERT INTO scheduled_jobs (id, fire_at, summon_request, reason, status, attempts, fired_run_id, created_at, updated_at)
     VALUES ('j2', 1, '{}', 'manual', 'firing', 0, 'fired2', 1, 1)`,
  ).run();
  everything();
  assert.equal(count(db, "scheduled_jobs"), 0, "the total nuke must not leave a job pointing at nothing");
});

// --- S2-14: deleting runs must not wedge or eat chats ----------------------

function seedConversation(db: Database.Database, id: string, status: string, activeRunId: string | null): void {
  db.prepare(
    "INSERT INTO conversations (id, agent_id, instance_id, status, active_run_id, created_at, updated_at) VALUES (?,'dev','default',?,?,1,1)",
  ).run(id, status, activeRunId);
}

function seedLoop(db: Database.Database, id: string, activeRunId: string | null): void {
  db.prepare(
    `INSERT INTO loops (id, conversation_id, agent_id, instance_id, reviewer_agent_id, goal, phase, round,
       spent_usd, started_at, config_json, created_at, updated_at, active_run_id)
     VALUES (?, NULL, 'dev', 'default', 'qa', 'g', 'reviewing', 1, 0, 1, '{}', 1, 1, ?)`,
  ).run(id, activeRunId);
}

test("a scoped run delete parks the chat it ran and ends the loop waiting on it", () => {
  // Both reconcilers read a missing run as "just spawned" and wait forever, so
  // DELETE /api/runs left the chat "running" with every new message queued behind it.
  const db = freshDb();
  seedRun(db, "ended", "error", 1);
  seedConversation(db, "c1", "running", "ended");
  db.prepare("INSERT INTO queued_messages (id, conversation_id, text, position, created_at) VALUES ('q1','c1','hi',0,1)").run();
  seedLoop(db, "l1", "ended");

  deleteRunsByAgent("dev");

  const conv = db.prepare("SELECT status, active_run_id FROM conversations WHERE id='c1'").get();
  assert.deepEqual(conv, { status: "needs_attention", active_run_id: null });
  assert.equal(count(db, "queued_messages"), 1, "the queued message is the user's: kept for Retry");
  const loop = db.prepare("SELECT phase, binding, active_run_id FROM loops WHERE id='l1'").get();
  assert.deepEqual(loop, { phase: "escalated", binding: "dispatch_failed", active_run_id: null });
});

test("a live run is never deleted, so its chat and loop still hear it finish", () => {
  // Parking a chat under a live run dropped the run's finish (the machine ignores
  // a runId that is not its active one) and let Resume start a second
  // `claude --resume` on the same session while the first was still writing.
  const db = freshDb();
  seedRun(db, "live", "running", null);
  seedConversation(db, "c1", "running", "live");
  seedLoop(db, "l1", "live");

  assert.equal(deleteRunsByAgent("dev"), 0);
  assert.deepEqual(db.prepare("SELECT status, active_run_id FROM conversations").get(), { status: "running", active_run_id: "live" });
  assert.equal((db.prepare("SELECT active_run_id FROM loops").get() as { active_run_id: string }).active_run_id, "live");
});

test("an idle chat whose old run is deleted only loses the pointer", () => {
  const db = freshDb();
  seedRun(db, "old", "done", 0);
  seedConversation(db, "c1", "idle", "old");

  deleteRunsByAgent("dev");

  assert.deepEqual(db.prepare("SELECT status, active_run_id FROM conversations").get(), { status: "idle", active_run_id: null });
});

test("the orphan sweep never deletes a chat turn or a sub-agent inside one", () => {
  // A crashed chat turn is stored as error/-1 too, and it IS the transcript.
  const db = freshDb();
  seedRun(db, "turn", "error", -1);
  seedChildren(db, "turn");
  seedRun(db, "sub", "error", -1, "turn");
  seedRun(db, "lone", "error", -1);
  seedConversation(db, "c1", "needs_attention", null);
  db.prepare("UPDATE runs SET conversation_id = 'c1' WHERE id = 'turn'").run();

  assert.equal(wipeOrphanedRuns().detail?.runs, 1);
  const left = (db.prepare("SELECT id FROM runs ORDER BY id").all() as Array<{ id: string }>).map((r) => r.id);
  assert.deepEqual(left, ["sub", "turn"]);
  for (const t of RUN_CHILD_TABLES) assert.equal(count(db, t), 1, `${t} lost a chat turn's row`);
});

// --- S5-7: the UI reset keeps the office --------------------------------------

test("resetting UI settings keeps office maps, decorations and the spend cap", () => {
  const db = freshDb();
  const put = db.prepare("INSERT INTO ui_settings (key, value, updated_at) VALUES (?, 'v', 1)");
  for (const k of ["theme", "tabs-state", "office-grid:p1", "office-decorations:p1", "office-agents", "claude-limits", "_migrated"]) put.run(k);

  assert.equal(resetUiSettings().cleared, 2);
  const keys = (db.prepare("SELECT key FROM ui_settings ORDER BY key").all() as Array<{ key: string }>).map((r) => r.key);
  assert.deepEqual(keys, ["_migrated", "claude-limits", "office-agents", "office-decorations:p1", "office-grid:p1"],
    "a reset that dropped claude-limits silently turned a hard spend cap back into a warning");
});
