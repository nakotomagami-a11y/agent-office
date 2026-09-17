/**
 * Pure logic tests — no React renderer, no DOM.
 *
 *   npx tsx apps/web/src/modules/summon/components/background-task-indicator.test.ts
 */
import assert from "node:assert";
import type { ProcessInfo } from "@agent-office/domain/types";
import { isBackgroundShellAlive, findLatestBackgroundTask } from "./background-task-logic";
import type { ThreadItem } from "../format/thread-types";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS  ${name}`);
}

const proc = (over: Partial<ProcessInfo>): ProcessInfo => ({
  pid: 1, port: 0, address: "", name: "n", cmd: "c", cwd: "/", startedAt: 0, memMb: 0, ...over,
});

check("isBackgroundShellAlive: no runId → false", () => {
  assert.equal(isBackgroundShellAlive([proc({ source: "background-task", runId: "run1" })], undefined), false);
});

check("isBackgroundShellAlive: matching background-task entry → true", () => {
  assert.equal(isBackgroundShellAlive([proc({ source: "background-task", runId: "run1" })], "run1"), true);
});

check("isBackgroundShellAlive: runId no longer present (shell died, row pruned) → false", () => {
  assert.equal(isBackgroundShellAlive([proc({ source: "background-task", runId: "run2" })], "run1"), false);
});

check("isBackgroundShellAlive: a port-scanned entry with the same runId but no source doesn't count", () => {
  assert.equal(isBackgroundShellAlive([proc({ runId: "run1" })], "run1"), false);
});

check("findLatestBackgroundTask: carries the item's runId through", () => {
  const thread: ThreadItem[] = [
    { kind: "you", id: "y1", text: "go" },
    { kind: "agent-tool", id: "t1", name: "Bash", arg: JSON.stringify({ command: "sleep 60", run_in_background: true }), runId: "run1" },
  ];
  const latest = findLatestBackgroundTask(thread);
  assert.equal(latest?.command, "sleep 60");
  assert.equal(latest?.runId, "run1");
});

console.log(`\n${passed} passed`);
