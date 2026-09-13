/**
 * Pure mapping test — PersistedRun turn → ThreadItem[]. No server, no DOM.
 *
 *   npx tsx apps/web/src/modules/summon/format/conversation-to-thread.test.ts
 */
import assert from "node:assert";
import type { PersistedRun } from "@agent-office/domain/types";
import { turnToThreadItems, turnsToThreadItems } from "./conversation-to-thread";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS  ${name}`);
}

const baseTurn: PersistedRun = {
  id: "run1", agentId: "dev", agentName: "Dev", ts: 1000, prompt: "do it",
  status: "done", output: "", tokensIn: 0, tokensOut: 0, cost: 0, durMs: 0,
  model: "", effort: "",
};

check("a done turn with output → you + agent-text + system-done", () => {
  const items = turnToThreadItems({
    ...baseTurn, output: "here you go", tokensIn: 10, tokensOut: 20, cost: 0.01, durMs: 500, exitCode: 0,
  });
  assert.deepEqual(items.map((i) => i.kind), ["you", "agent-text", "system-done"]);
  assert.equal(items[0]!.id, "run1_you");
  assert.equal((items[0] as { text: string }).text, "do it");
  assert.equal((items[1] as { text: string; streaming: boolean }).text, "here you go");
  assert.equal((items[1] as { streaming: boolean }).streaming, false);
  const done = items[2] as { exitCode: number; tokensIn?: number; tokensOut?: number; cost?: number; durationMs?: number };
  assert.equal(done.exitCode, 0);
  assert.equal(done.tokensIn, 10);
  assert.equal(done.cost, 0.01);
  assert.equal(done.durationMs, 500);
});

check("a done turn with EMPTY output → just you + system-done (no blank bubble)", () => {
  const items = turnToThreadItems({ ...baseTurn, output: "" });
  assert.deepEqual(items.map((i) => i.kind), ["you", "system-done"]);
});

check("a failed turn → you + agent-text (if any) + system-error(unknown)", () => {
  const items = turnToThreadItems({ ...baseTurn, status: "error", exitCode: 1, output: "partial output before it died" });
  assert.deepEqual(items.map((i) => i.kind), ["you", "agent-text", "system-error"]);
  const err = items[2] as { code: string };
  assert.equal(err.code, "unknown"); // no classified code survives historically — see file header
});

check("a still-running turn (caller forgot to exclude it) → just the you bubble", () => {
  const items = turnToThreadItems({ ...baseTurn, status: "running", output: "" });
  assert.deepEqual(items.map((i) => i.kind), ["you"]);
});

check("a turn with backgroundTaskCommand → you + agent-tool(Bash) + agent-text + system-done", () => {
  const items = turnToThreadItems({
    ...baseTurn, output: "started it", backgroundTaskCommand: "sleep 240 && echo done",
  });
  assert.deepEqual(items.map((i) => i.kind), ["you", "agent-tool", "agent-text", "system-done"]);
  const tool = items[1] as { name: string; arg?: string; runId?: string };
  assert.equal(tool.name, "Bash");
  const parsedArg = JSON.parse(tool.arg!);
  assert.equal(parsedArg.command, "sleep 240 && echo done");
  assert.equal(parsedArg.run_in_background, true);
  // The pill checks liveness by runId — this must be the real run id, not a
  // synthetic one, so it can be matched against /api/processes.
  assert.equal(tool.runId, "run1");
});

check("no backgroundTaskCommand → no agent-tool item (existing turns unaffected)", () => {
  const items = turnToThreadItems({ ...baseTurn, output: "no bg task here" });
  assert.ok(!items.some((i) => i.kind === "agent-tool"));
});

check("turnsToThreadItems flattens multiple turns in order", () => {
  const items = turnsToThreadItems([
    { ...baseTurn, id: "a", prompt: "first", output: "1" },
    { ...baseTurn, id: "b", prompt: "second", output: "2" },
  ]);
  assert.deepEqual(
    items.filter((i) => i.kind === "you").map((i) => (i as { text: string }).text),
    ["first", "second"],
  );
});

console.log(`\n${passed} passed`);
