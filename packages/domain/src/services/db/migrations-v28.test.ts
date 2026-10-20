/**
 * v27 → v28 on a populated database: the provider tables appear, old run rows survive and read as
 * `subscription` / `notional`.
 *
 *   pnpm --filter @agent-office/domain test src/services/db/migrations-v28.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import Database from "better-sqlite3";
import { createSchema } from "./migrations";
import { rowToRun, type RunRow } from "./runs";

function v27WithARun(): Database.Database {
  const db = new Database(":memory:");
  createSchema(db);
  db.exec(`
    DROP TABLE provider_configs;
    DROP TABLE provider_selection;
    ALTER TABLE runs DROP COLUMN provider;
    ALTER TABLE runs DROP COLUMN cost_basis;
  `);
  db.pragma("user_version = 27");
  db.prepare("INSERT INTO runs (id, agent_id, agent_name, prompt, started_at, cost_usd) VALUES ('r1', 'a', 'A', 'hi', 1, 0.5)").run();
  return db;
}

test("v28 adds the provider tables and run columns without touching old rows", () => {
  const db = v27WithARun();
  createSchema(db);
  assert.equal(db.pragma("user_version", { simple: true }), 28);
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((t) => t.name);
  assert.ok(tables.includes("provider_configs") && tables.includes("provider_selection"));
  const run = rowToRun(db.prepare("SELECT * FROM runs WHERE id = 'r1'").get() as RunRow);
  assert.equal(run.cost, 0.5);
  assert.equal(run.provider, "subscription");
  assert.equal(run.costBasis, "notional");
});

test("provider_selection holds at most one row", () => {
  const db = new Database(":memory:");
  createSchema(db);
  assert.throws(() => db.prepare("INSERT INTO provider_selection (id, provider, source, changed_at) VALUES (2, 'local', 'chosen', 1)").run());
});
