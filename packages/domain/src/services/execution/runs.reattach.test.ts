/**
 * A failed run stays in `liveRuns` for hours. A page reload re-attaches to it
 * through attachEmit, which only replays the event log — and error events are
 * not in it. Without the explicit replay the card fell back to "The agent hit
 * an error." with no detail.
 *
 *   pnpm --filter @agent-office/domain test src/services/execution/runs.reattach.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { attachEmit, type SseEvent } from "./runs";
import { liveRuns } from "./runs/registry";
import type { LiveRun } from "./runs/types";

test("re-attaching to a finished failed run replays its error before done", () => {
  const runId = "reattach-1";
  liveRuns.set(runId, {
    id: runId,
    status: "error",
    exitCode: 1,
    startTs: 0,
    finishedAt: 10,
    tokensIn: 0,
    tokensOut: 0,
    cost: 0,
    subscribers: new Set(),
    eventLog: [{ name: "chunk", data: { runId, text: "working on it" } }],
    error: { code: "unknown", detail: "Claude CLI exited with code 1 (last tool: Bash): TypeError: boom" },
  } as unknown as LiveRun);

  const events: SseEvent[] = [];
  try {
    assert.ok(attachEmit(runId, (e) => { events.push(e); }));
  } finally {
    liveRuns.delete(runId);
  }

  const names = events.map((e) => e.name);
  assert.deepEqual(names, ["attached", "chunk", "error", "done"]);
  const err = events[2];
  assert.ok(err?.name === "error");
  assert.equal(err.data.detail, "Claude CLI exited with code 1 (last tool: Bash): TypeError: boom");
});
