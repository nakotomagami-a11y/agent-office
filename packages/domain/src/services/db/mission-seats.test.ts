import assert from "node:assert";
import { test, beforeEach } from "node:test";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupSavedPrompts, createSchema } from "./migrations";
import {
  addMissionSpend,
  advanceMissionCursor,
  getMissionSeat,
  insertMissionSeat,
  listActiveMissionSeats,
  markMissionSeatLeft,
  missionSeatForInstance,
  raiseMissionCap,
} from "./mission-seats";

beforeEach(() => {
  const mem = new Database(":memory:");
  createSchema(mem);
  globalThis.__agentOfficeDb = mem;
});

const base = { missionId: "k3f9q2", seat: "macos", projectId: "demo", prNumber: 690, agentId: "developer", instanceId: "mission-k3f9q2-macos", hubBranch: "mission/k3f9q2", leadDevice: "win-pc", manifestJson: "{}", capUsd: 5, cursor: { id: 10, at: "t10" } };

test("a claimed seat is findable by mission and by its chat's instance", () => {
  insertMissionSeat(base);
  assert.deepStrictEqual(getMissionSeat("k3f9q2", "macos")?.cursor, { id: 10, at: "t10" });
  assert.strictEqual(missionSeatForInstance("mission-k3f9q2-macos")?.seat, "macos");
  assert.strictEqual(missionSeatForInstance("developer-abc"), null);
});

test("the cursor only moves forward", () => {
  insertMissionSeat(base);
  advanceMissionCursor("k3f9q2", "macos", { id: 30, at: "t30" });
  advanceMissionCursor("k3f9q2", "macos", { id: 20, at: "t20" });
  assert.deepStrictEqual(getMissionSeat("k3f9q2", "macos")?.cursor, { id: 30, at: "t30" });
});

test("spend accrues, the cap rises only by a positive amount", () => {
  insertMissionSeat(base);
  addMissionSpend("k3f9q2", "macos", 1.25);
  addMissionSpend("k3f9q2", "macos", -9);
  raiseMissionCap("k3f9q2", "macos", 5);
  raiseMissionCap("k3f9q2", "macos", 0);
  const s = getMissionSeat("k3f9q2", "macos");
  assert.deepStrictEqual([s?.spentUsd, s?.capUsd], [1.25, 10]);
});

test("a left seat drops out of the active list and its chat; claiming again starts over", () => {
  insertMissionSeat(base);
  addMissionSpend("k3f9q2", "macos", 3);
  markMissionSeatLeft("k3f9q2", "macos");
  assert.deepStrictEqual([listActiveMissionSeats().length, missionSeatForInstance("mission-k3f9q2-macos")], [0, null]);
  const again = insertMissionSeat({ ...base, cursor: { id: 99, at: "t99" } });
  assert.deepStrictEqual([again.leftAt, again.spentUsd, again.cursor?.id], [null, 0, 99]);
});

test("v27 writes saved Workflows to a backup file before it drops their table", () => {
  const old = new Database(":memory:");
  old.exec("CREATE TABLE saved_prompts (id TEXT PRIMARY KEY, title TEXT, body TEXT, category TEXT, created_at INTEGER, use_count INTEGER)");
  assert.strictEqual(backupSavedPrompts(old, mkdtempSync(join(tmpdir(), "ao-bk-"))), null, "no rows, no file");
  old.prepare("INSERT INTO saved_prompts VALUES ('w1', 'Ship it', 'Run the release', 'mine', 1, 3)").run();
  const file = backupSavedPrompts(old, mkdtempSync(join(tmpdir(), "ao-bk-")));
  assert.ok(file);
  assert.deepStrictEqual(JSON.parse(readFileSync(file, "utf8")), [{ id: "w1", title: "Ship it", body: "Run the release", category: "mine", created_at: 1, use_count: 3 }]);
});
