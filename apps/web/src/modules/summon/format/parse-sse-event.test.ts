/**
 * The live path must keep every field the server sends on a `tool` event. The
 * schema here once stripped `ts` (zod drops unknown keys), so image-job cards had
 * no start time during a run and only appeared after the turn was rebuilt from
 * history — all images at once, no loading phase.
 *
 *   pnpm --filter @agent-office/web test src/modules/summon/format/parse-sse-event.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { applySseEvent, parseSseEvent } from "./parse-sse-event";

test("a live tool event keeps its server timestamp all the way onto the thread item", () => {
  const raw = { runId: "r1", name: "Bash", input: { command: "imggen x --seed 1" }, toolUseId: "toolu_1", ts: 1_791_444_000_000 };
  const event = parseSseEvent("tool", raw);
  assert.ok(event);
  const { thread } = applySseEvent({ thread: [], usage: { tokensIn: 0, tokensOut: 0, cost: 0 } }, event);
  const item = thread[0];
  assert.equal(item?.kind, "agent-tool");
  assert.equal(item?.kind === "agent-tool" ? item.ts : undefined, 1_791_444_000_000);
});

test("tool-done stamps its row once; a replayed event cannot move the stamp", () => {
  const empty = { thread: [], usage: { tokensIn: 0, tokensOut: 0, cost: 0 } };
  const tool = parseSseEvent("tool", { runId: "r1", name: "Bash", toolUseId: "toolu_1", ts: 100 })!;
  let { thread } = applySseEvent(empty, tool);
  for (const ts of [200, 300]) {
    const done = parseSseEvent("tool-done", { runId: "r1", toolUseId: "toolu_1", ts });
    assert.ok(done);
    ({ thread } = applySseEvent({ ...empty, thread }, done));
  }
  const item = thread[0];
  assert.equal(item?.kind === "agent-tool" ? item.doneTs : undefined, 200);
});

// B6: `subagent` is replayed on reconnect, and the card's start was the replay time.
test("a replayed sub-agent keeps the server's start and duration, not the reconnect time", () => {
  const empty = { thread: [], usage: { tokensIn: 0, tokensOut: 0, cost: 0 } };
  const spawned = parseSseEvent("subagent", { type: "subagent", parentRunId: "r1", subRunId: "s1", agentId: "qa", prompt: "check", status: "running", startTs: 1_000 });
  assert.ok(spawned);
  let { thread } = applySseEvent(empty, spawned);
  const done = parseSseEvent("subagent-update", { type: "subagent-update", subRunId: "s1", status: "done", tokensIn: 0, tokensOut: 0, cost: 0, durationMs: 4_000 });
  assert.ok(done);
  ({ thread } = applySseEvent({ ...empty, thread }, done));
  const card = thread[0];
  assert.equal(card?.kind, "agent-subagent");
  assert.equal(card?.kind === "agent-subagent" ? card.startTs : undefined, 1_000);
  assert.equal(card?.kind === "agent-subagent" ? card.durationMs : undefined, 4_000);
});
