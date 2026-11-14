/**
 * After the agent's own reply, background sub-agents are all that keeps a run alive. The live row
 * has to count them, or a run waiting on three agents looks finished.
 *
 *   pnpm --filter @agent-office/web test src/modules/summon/format/phase-format.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import type { SubAgentStatus, ThreadItem } from "@agent-office/domain/types";
import { countRunningAgents, isSubAgentLive } from "./phase-format";

const agent = (id: string, status: SubAgentStatus): ThreadItem =>
  ({ kind: "agent-subagent", id, name: "developer", prompt: "p", status, startTs: 0 });

test("queued, running and cancelling sub-agents count; finished ones and other items do not", () => {
  const thread: ThreadItem[] = [
    { kind: "agent-text", id: "t", text: "I'll report when they're done.", streaming: false },
    agent("a", "running"), agent("b", "queued"), agent("c", "cancelling"),
    agent("d", "done"), agent("e", "error"), agent("f", "cancelled"), agent("g", "timeout"),
  ];
  assert.equal(countRunningAgents(thread), 3);
  assert.equal(countRunningAgents([]), 0);
});

test("one definition of a live sub-agent: the card, the stream reducer and the waiting label agree", () => {
  const live: SubAgentStatus[] = ["queued", "running", "cancelling"];
  const settled: SubAgentStatus[] = ["done", "error", "cancelled", "timeout"];
  assert.deepStrictEqual([...live, ...settled].map(isSubAgentLive), [true, true, true, false, false, false, false]);
});
