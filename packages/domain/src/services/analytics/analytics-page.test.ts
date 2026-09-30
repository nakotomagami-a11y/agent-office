/**
 * The `byTool` aggregation — the half of A52 that was actually rewritten, and
 * the half that shipped with no tests. The pure labeller had 81 lines of
 * coverage while the SQL -> TS move had none, which is backwards: the move is
 * where a contract changed and a caller could silently break.
 *
 * Runs against throwaway in-memory SQLite — never touches the real DB.
 *
 *   pnpm --filter @agent-office/domain test
 */
import assert from "node:assert";
import { test } from "node:test";
import Database from "better-sqlite3";
import { createSchema } from "./../db/migrations";
import { insertToolCall } from "./../db/messages";
import { insertRun } from "./../db/runs";
import { getAnalyticsPage } from "./analytics-page";

const mem = new Database(":memory:");
mem.pragma("foreign_keys = ON");
createSchema(mem);
globalThis.__agentOfficeDb = mem;

const T = 1_000_000;
let seq = 0;
function run(): string {
  const id = `run-${++seq}`;
  insertRun({ id, agentId: "dev", agentName: "Dev", instanceId: "t", status: "done", prompt: "p", model: "", effort: "", startedAt: T });
  return id;
}
const bash = (runId: string, command: string) =>
  insertToolCall(runId, "Bash", { command }, T, `toolu_${++seq}`);

const page = () => getAnalyticsPage({ start: 0, end: T * 10 });
const row = (name: string) => page().byTool.find((r) => r.name === name);

const a = run();
const b = run();
bash(a, "git status");
bash(a, "git log");
bash(b, "git push");            // same label, different run
bash(a, "pnpm build");
insertToolCall(a, "Read", { file_path: "/x" }, T, `toolu_${++seq}`);
// A content_block_start half-record: its full twin is already counted above.
insertToolCall(a, "Bash", {}, T, `toolu_${++seq}`);

test("calls are counted per label", () => {
  assert.equal(row("Bash: git")?.calls, 3);
  assert.equal(row("Bash: pnpm")?.calls, 1);
  assert.equal(row("Read")?.calls, 1);
});

test("`runs` is the DISTINCT run count, not the call count", () => {
  // Reproduces the old SQL `COUNT(DISTINCT tc.run_id)`. Getting this wrong
  // would make every label look like it touched more runs than it did.
  assert.equal(row("Bash: git")?.runs, 2, "3 calls across 2 runs");
  assert.equal(row("Bash: pnpm")?.runs, 1);
});

test("a Bash row with no command is excluded, not bucketed", () => {
  // It is half of a call that is also recorded in full — counting it would
  // double the total AND rebuild the meaningless "Bash" bar.
  assert.equal(row("Bash"), undefined);
});

test("toolCallsTotal counts everything, not just the rendered top 12", () => {
  // The UI subtitle sums this. When byTool was the complete partition a
  // reduce() over it was exact; with ~60 labels sliced to 12 it silently
  // undercounts, so the total has to come off the contract.
  const d = page();
  const rendered = d.byTool.reduce((s, t) => s + t.calls, 0);
  assert.equal(d.toolCallsTotal, 5, "4 labelled Bash + 1 Read, half-record excluded");
  assert.equal(rendered, 5, "with few labels the slice happens to agree");
});

test("byTool is capped at 12 while the total still counts the tail", () => {
  const c = run();
  for (let i = 0; i < 20; i++) bash(c, `prog${i} --flag`);
  const d = page();
  assert.equal(d.byTool.length, 12, "the chart renders at most 12 bars");
  assert.ok(
    d.toolCallsTotal > d.byTool.reduce((s, t) => s + t.calls, 0),
    "the total must exceed the rendered subtotal once the tail is dropped",
  );
});
