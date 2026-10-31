/**
 * v28 → v29 on a populated database: scheduled_jobs gains the repeat columns, and existing jobs
 * stay one-shots.
 *
 *   pnpm --filter @agent-office/domain test src/services/db/migrations-v29.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import Database from "better-sqlite3";
import { createSchema } from "./migrations";
import { getScheduledJob } from "./scheduled-jobs";

test("v29 adds the repeat columns and leaves old jobs one-shot", () => {
  const db = new Database(":memory:");
  createSchema(db);
  db.exec(`
    ALTER TABLE scheduled_jobs DROP COLUMN repeat_every;
    ALTER TABLE scheduled_jobs DROP COLUMN repeat_anchor;
  `);
  db.pragma("user_version = 28");
  db.prepare(`INSERT INTO scheduled_jobs (id, fire_at, summon_request, created_at, updated_at)
    VALUES ('j1', 5, '{"agentId":"a","prompt":"hi"}', 1, 1)`).run();

  createSchema(db);
  assert.equal(db.pragma("user_version", { simple: true }), 29);
  globalThis.__agentOfficeDb = db;
  const job = getScheduledJob("j1");
  assert.equal(job?.fireAt, 5);
  assert.equal(job?.repeat, undefined);
});
