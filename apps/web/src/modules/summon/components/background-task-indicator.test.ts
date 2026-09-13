/**
 * Pure logic tests — no React renderer needed (see the split between
 * `isBackgroundTaskExpired` and the `useIsBackgroundTaskExpired` hook that
 * just wraps it).
 *
 *   npx tsx apps/web/src/modules/summon/components/background-task-indicator.test.ts
 */
import assert from "node:assert";
import { BACKGROUND_TASK_EXPIRY_MS, isBackgroundTaskExpired, findLatestBackgroundTask } from "./background-task-logic";
import type { ThreadItem } from "../format/thread-types";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS  ${name}`);
}

check("isBackgroundTaskExpired: undefined startedAt never expires", () => {
  assert.equal(isBackgroundTaskExpired(undefined, Date.now()), false);
});

check("isBackgroundTaskExpired: just under the window → not expired", () => {
  const startedAt = 1_000_000;
  assert.equal(isBackgroundTaskExpired(startedAt, startedAt + BACKGROUND_TASK_EXPIRY_MS - 1), false);
});

check("isBackgroundTaskExpired: exactly at the window → not expired (strict >)", () => {
  const startedAt = 1_000_000;
  assert.equal(isBackgroundTaskExpired(startedAt, startedAt + BACKGROUND_TASK_EXPIRY_MS), false);
});

check("isBackgroundTaskExpired: just over the window → expired", () => {
  const startedAt = 1_000_000;
  assert.equal(isBackgroundTaskExpired(startedAt, startedAt + BACKGROUND_TASK_EXPIRY_MS + 1), true);
});

check("findLatestBackgroundTask: carries the item's ts through as startedAt", () => {
  const thread: ThreadItem[] = [
    { kind: "you", id: "y1", text: "go" },
    { kind: "agent-tool", id: "t1", name: "Bash", arg: JSON.stringify({ command: "sleep 60", run_in_background: true }), ts: 5000 },
  ];
  const latest = findLatestBackgroundTask(thread);
  assert.equal(latest?.command, "sleep 60");
  assert.equal(latest?.startedAt, 5000);
});

console.log(`\n${passed} passed`);
