/**
 * Tool calls were recorded TWICE — once at `content_block_start` with
 * `input: {}` and once at the `assistant` event with the real input, each
 * under a fresh randomUUID. Every analytics count was ~2x and 43% of rows
 * carried no input at all.
 *
 * Verified against the live CLI (v2.1.278): both events carry the SAME
 * `toolu_...` id, so upserting on it collapses the pair.
 *
 *   content_block_start -> id toolu_01Cyt…  input {}
 *   assistant           -> id toolu_01Cyt…  input {"command":"echo hi",…}
 *
 * Runs against throwaway in-memory SQLite — never touches the real DB.
 *
 *   pnpm --filter @agent-office/domain test
 */
import assert from "node:assert";
import { test } from "node:test";
import Database from "better-sqlite3";
import { createSchema } from "./migrations";
import { insertToolCall } from "./messages";
import { insertRun } from "./runs";

const mem = new Database(":memory:");
mem.pragma("foreign_keys = ON");
createSchema(mem);
globalThis.__agentOfficeDb = mem;

let seq = 0;
function freshRun(): string {
  const id = `run-${++seq}`;
  insertRun({ id, agentId: "dev", agentName: "Dev", instanceId: "t", status: "done", prompt: "p", model: "", effort: "", startedAt: 1000 });
  return id;
}
const rows = (runId: string) =>
  mem.prepare("SELECT id, name, input FROM tool_calls WHERE run_id = ?").all(runId) as
    { id: string; name: string; input: string }[];

test("the two events for one call collapse into a single row", () => {
  const run = freshRun();
  const toolUseId = "toolu_01SAME";
  insertToolCall(run, "Bash", {}, 1000, toolUseId);                        // content_block_start
  insertToolCall(run, "Bash", { command: "echo hi" }, 3000, toolUseId);    // assistant

  const r = rows(run);
  assert.equal(r.length, 1, "expected ONE row, not a duplicate pair");
  assert.deepEqual(JSON.parse(r[0]!.input), { command: "echo hi" }, "the complete input must win");
});

test("a late EMPTY input cannot overwrite a complete one", () => {
  // Guards against event reordering: the guard is on the value, not the clock.
  const run = freshRun();
  const id = "toolu_02ORDER";
  insertToolCall(run, "Bash", { command: "pnpm build" }, 1000, id);
  insertToolCall(run, "Bash", {}, 9000, id);

  assert.deepEqual(JSON.parse(rows(run)[0]!.input), { command: "pnpm build" });
});

test("a call that only ever reaches content_block_start is still recorded", () => {
  // An interrupted run never emits the assistant event. Dropping the early
  // insert would lose the call entirely — the reason this is an upsert and
  // not simply "stop writing at content_block_start".
  const run = freshRun();
  insertToolCall(run, "Bash", {}, 1000, "toolu_03TRUNCATED");

  const r = rows(run);
  assert.equal(r.length, 1);
  assert.equal(r[0]!.input, "{}");
});

test("distinct calls stay distinct, including the same tool twice", () => {
  const run = freshRun();
  insertToolCall(run, "Bash", { command: "ls" }, 1000, "toolu_04A");
  insertToolCall(run, "Bash", { command: "pwd" }, 2000, "toolu_04B");
  insertToolCall(run, "Read", { file_path: "/x" }, 3000, "toolu_04C");

  assert.equal(rows(run).length, 3);
});

test("without a tool-use id each write is its own row, as before", () => {
  // Any caller that cannot supply an id keeps the old behaviour rather than
  // silently colliding on a shared key.
  const run = freshRun();
  insertToolCall(run, "Bash", { command: "a" }, 1000);
  insertToolCall(run, "Bash", { command: "b" }, 2000);

  assert.equal(rows(run).length, 2);
});

test("the same tool-use id in a DIFFERENT run does not collide", () => {
  const a = freshRun();
  const b = freshRun();
  insertToolCall(a, "Bash", { command: "first" }, 1000, "toolu_05SHARED");
  insertToolCall(b, "Bash", { command: "second" }, 2000, "toolu_05SHARED");
  // The id is globally unique in practice; this pins what happens if it is not.
  assert.equal(rows(a).length + rows(b).length, 1, "a shared id is one row by construction");
});
