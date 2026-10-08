/**
 * The live path must keep every field the server sends on a `tool` event. The
 * schema here once stripped `ts` (zod drops unknown keys), so image-job cards had
 * no start time during a run and only appeared after the turn was rebuilt from
 * history — all images at once, no loading phase.
 *
 *   pnpm exec tsx --test src/modules/summon/format/parse-sse-event.test.ts
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
