/**
 * v29 → v30 on a populated database: the office floor's ui_settings rows are dropped after a copy is
 * on disk, and the roster groups that `office-view` held survive as `roster-groups`.
 *
 *   pnpm --filter @agent-office/domain test src/services/db/migrations-v30.test.ts
 */
import assert from "node:assert";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Database from "better-sqlite3";
import { BACKUPS_DIR } from "../infra/paths";
import { backupOfficeSettings, createSchema } from "./migrations";

function v29(rows: Record<string, string>): Database.Database {
  const db = new Database(":memory:");
  createSchema(db);
  db.pragma("user_version = 29");
  const put = db.prepare("INSERT INTO ui_settings (key, value, updated_at) VALUES (?, ?, 1)");
  for (const [k, v] of Object.entries(rows)) put.run(k, v);
  return db;
}

function settings(db: Database.Database): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM ui_settings ORDER BY key").all() as Array<{ key: string; value: string }>;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

test("v30 drops the office rows and keeps the roster groups", () => {
  const groups = JSON.stringify({ view: "iso", pinnedGroups: { p1: ["dev"] }, expandedGroups: {} });
  const db = v29({
    "office-view": groups,
    "office-grid": "[]",
    "office-decorations:p1": "{}",
    "office-agents:p1": "{}",
    "office-map-rev": "3",
    "agent-office:wizard-draft": "{}",
    theme: "dark",
    _migrated: "1",
  });

  const listBackups = () => { try { return readdirSync(BACKUPS_DIR); } catch { return []; } };
  const before = new Set(listBackups());
  createSchema(db);
  assert.ok((db.pragma("user_version", { simple: true }) as number) >= 30);
  const added = listBackups().filter((f) => !before.has(f) && f.startsWith("office-ui-settings-"));
  assert.equal(added.length, 1, "the migration itself must write the backup");
  assert.match(readFileSync(join(BACKUPS_DIR, added[0]!), "utf8"), /office-grid/);
  assert.deepEqual(settings(db), { _migrated: "1", "agent-office:wizard-draft": "{}", "roster-groups": groups, theme: "dark" });
});

test("v30 never overwrites an existing roster-groups row", () => {
  const db = v29({ "office-view": "old", "roster-groups": "new" });
  createSchema(db);
  assert.deepEqual(settings(db), { "roster-groups": "new" });
});

test("the office rows are copied to the backups folder before they go", () => {
  const db = v29({ "office-grid": "my map", theme: "dark" });
  const file = backupOfficeSettings(db, mkdtempSync(join(tmpdir(), "ao-office-bk-")));
  assert.ok(file);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), [{ key: "office-grid", value: "my map" }]);
  assert.equal(backupOfficeSettings(v29({ theme: "dark" }), mkdtempSync(join(tmpdir(), "ao-office-bk-"))), null, "no rows, no file");
});
