/**
 * v30 → v31 on a populated database: the legacy `transcripts`, `pipelines` and `pipeline_steps`
 * tables go, and any rows they still held are on disk first.
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

test("v31 drops the legacy tables after backing up their rows", () => {
  const db = new Database(":memory:");
  createSchema(db);
  db.exec(`
    CREATE TABLE transcripts (agent_id TEXT NOT NULL, instance_id TEXT NOT NULL, items TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE pipelines (id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE pipeline_steps (pipeline_id TEXT NOT NULL REFERENCES pipelines(id), step_index INTEGER NOT NULL);
  `);
  db.pragma("user_version = 30");
  db.prepare("INSERT INTO transcripts VALUES ('dev', 'default', '[\"old chat\"]', 7)").run();
  const before = new Set(existsSync(BACKUPS_DIR) ? readdirSync(BACKUPS_DIR) : []);

  createSchema(db);

  assert.equal(db.pragma("user_version", { simple: true }), 31);
  const left = tables(db);
  for (const t of ["transcripts", "pipelines", "pipeline_steps"]) assert.ok(!left.includes(t), `${t} survived v31`);
  const written = readdirSync(BACKUPS_DIR).filter((f) => !before.has(f));
  assert.deepEqual(written.map((f) => f.replace(/-\d+\.json$/, "")), ["transcripts"], "only a table with rows is backed up");
  assert.deepEqual(JSON.parse(readFileSync(join(BACKUPS_DIR, written[0]!), "utf8")), [
    { agent_id: "dev", instance_id: "default", items: "[\"old chat\"]", updated_at: 7 },
  ]);
});

test("a fresh database never creates the legacy tables it would drop", () => {
  const db = new Database(":memory:");
  createSchema(db);
  assert.deepEqual(tables(db).filter((t) => ["transcripts", "pipelines", "pipeline_steps"].includes(t)), []);
});
