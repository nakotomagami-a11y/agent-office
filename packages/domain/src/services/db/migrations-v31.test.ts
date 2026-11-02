/**
 * v30 → v31 on a populated database: the legacy `transcripts`, `pipelines` and `pipeline_steps`
 * tables are emptied (not dropped: an older installed build still reads them), and any rows they
 * still held are on disk first.
 *
 *   pnpm --filter @agent-office/domain test src/services/db/migrations-v31.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createSchema } from "./migrations";
import { BACKUPS_DIR } from "../infra/paths";

const tables = (db: Database.Database) =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((t) => t.name);

test("v31 empties the legacy tables after backing up their rows, and keeps them", () => {
  const db = new Database(":memory:");
  createSchema(db);
  db.pragma("user_version = 30");
  db.prepare("INSERT INTO transcripts (agent_id, instance_id, items, updated_at) VALUES ('dev', 'default', '[\"old chat\"]', 7)").run();
  const before = new Set(existsSync(BACKUPS_DIR) ? readdirSync(BACKUPS_DIR) : []);

  createSchema(db);

  assert.equal(db.pragma("user_version", { simple: true }), 31);
  const left = tables(db);
  for (const t of ["transcripts", "pipelines", "pipeline_steps"]) {
    assert.ok(left.includes(t), `${t} was dropped; an older build sharing the db still reads it`);
    assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n, 0, `${t} still has rows`);
  }
  // Other test files write backups into the same folder at the same time.
  const written = readdirSync(BACKUPS_DIR).filter((f) => !before.has(f) && /^(transcripts|pipelines|pipeline_steps)-\d+\.json$/.test(f));
  assert.deepEqual(written.map((f) => f.replace(/-\d+\.json$/, "")), ["transcripts"], "only a table with rows is backed up");
  const saved: unknown = JSON.parse(readFileSync(join(BACKUPS_DIR, written[0]!), "utf8"));
  assert.ok(Array.isArray(saved) && saved.length === 1);
  const row: unknown = saved[0];
  assert.ok(typeof row === "object" && row !== null);
  const { agent_id, instance_id, items, updated_at } = row as Record<string, unknown>;
  assert.deepEqual([agent_id, instance_id, items, updated_at], ["dev", "default", "[\"old chat\"]", 7]);
});

test("a fresh database holds no legacy rows", () => {
  const db = new Database(":memory:");
  createSchema(db);
  for (const t of tables(db).filter((n) => ["transcripts", "pipelines", "pipeline_steps"].includes(n))) {
    assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n, 0, t);
  }
});
