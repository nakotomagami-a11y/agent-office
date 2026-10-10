import assert from "node:assert";
import { test } from "node:test";
import Database from "better-sqlite3";
import { createSchema } from "../../db/migrations";
import * as db from "../../db";
import type { LiveRun } from "./types";
import { createdPr, isPrCreateInput, notePrCreate, settlePrCreate } from "./pr-create";

const mem = new Database(":memory:");
createSchema(mem);
globalThis.__agentOfficeDb = mem;

const run = { agentId: "developer", instanceId: "developer-abc", projectId: "office", pendingPrCreate: new Set<string>() } as unknown as LiveRun;

test("only a gh pr create command is noted, not the words inside another command", () => {
  assert.strictEqual(isPrCreateInput({ command: "gh pr create --fill" }), true);
  assert.strictEqual(isPrCreateInput({ command: "git push -u origin HEAD && gh pr create --fill" }), true);
  assert.strictEqual(isPrCreateInput({ command: "cd repo; gh pr create" }), true);
  assert.strictEqual(isPrCreateInput({ command: "echo gh pr create; ./script" }), false);
  assert.strictEqual(isPrCreateInput({ command: "gh pr view 7" }), false);
});

test("the PR is the first URL alone on its line, not one inside other output", () => {
  assert.deepStrictEqual(
    createdPr("remote: see https://github.com/Owner/Repo/pull/3 for details\nhttps://github.com/Owner/Repo/pull/12\nhttps://github.com/x/y/pull/99\n"),
    { repo: "owner/repo", number: 12 },
  );
  assert.strictEqual(createdPr("a pull request create failed"), null);
});

test("a successful gh pr create links the PR to the run's seat; a failed or unrelated call does not", () => {
  notePrCreate(run, "Bash", "t1", { command: "gh pr create --fill" });
  notePrCreate(run, "Bash", "t2", { command: "gh pr create --fill" });
  notePrCreate(run, "Read", "t3", { command: "gh pr create" });
  assert.deepStrictEqual([...run.pendingPrCreate], ["t1", "t2"]);

  settlePrCreate(run, "t2", true, () => "https://github.com/o/r/pull/2");
  settlePrCreate(run, "t1", false, () => "https://github.com/o/r/pull/1");
  settlePrCreate(run, "t9", false, () => "https://github.com/o/r/pull/9");

  assert.strictEqual(run.pendingPrCreate.size, 0);
  assert.deepStrictEqual(db.getPrLink("o/r", 1), {
    repo: "o/r", number: 1, projectId: "office", agentId: "developer", instanceId: "developer-abc", source: "recorded",
  });
  assert.strictEqual(db.getPrLink("o/r", 2), null, "a failed call links nothing");
  assert.strictEqual(db.getPrLink("o/r", 9), null, "a result for a call never noted links nothing");
});
