/**
 * The conversation machine's guarantees. Pure reducer, no I/O.
 *
 *   pnpm --filter @agent-office/domain test src/services/execution/conversation-machine.test.ts
 */
import assert from "node:assert";
import type { MessageOrigin } from "../../types/index";
import {
  reduce,
  initialConversationState,
  RESUME_PROMPT,
  type ConversationState,
  type ConversationAction,
  type ConversationEffect,
} from "./conversation-machine";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS  ${name}`);
}

const msg = (id: string, text = id, origin: MessageOrigin = "user") => ({ id, text, origin });
const sys = (id: string) => msg(id, id, "system");

function run(state: ConversationState, actions: ConversationAction[]): { state: ConversationState; effects: ConversationEffect[] } {
  let s = state;
  const effects: ConversationEffect[] = [];
  for (const a of actions) {
    const r = reduce(s, a);
    s = r.state;
    effects.push(...r.effects);
  }
  return { state: s, effects };
}

const working = (): ConversationState =>
  run(initialConversationState(), [
    { type: "send", message: msg("a") },
    { type: "turnOpened", runId: "r1", prompt: "a", origin: "user" },
  ]).state;

check("an idle send goes to the agent at once", () => {
  const r = reduce(initialConversationState(), { type: "send", message: msg("a") });
  assert.equal(r.state.status, "running");
  assert.deepEqual(r.effects, [{ type: "deliver", message: msg("a") }]);
});

check("a user message sent mid-turn goes to the agent at once too: nothing queues", () => {
  const r = reduce(working(), { type: "send", message: msg("b") });
  assert.deepEqual(r.effects, [{ type: "deliver", message: msg("b") }]);
  assert.equal(r.state.queue.length, 0);
  assert.equal(r.state.activeRunId, "r1", "the turn it lands in is still the one running");
});

check("a user message after a failure goes through and clears it", () => {
  const failed = run(working(), [{ type: "turnEnded", runId: "r1", ok: false }, { type: "idle" }]).state;
  assert.equal(failed.status, "needs_attention");
  const r = reduce(failed, { type: "send", message: msg("b") });
  assert.equal(r.state.status, "running");
  assert.equal(r.state.lastFailed, false);
  assert.deepEqual(r.effects, [{ type: "deliver", message: msg("b") }]);
});

check("Agent Office's own message waits while the agent works, and goes when it is idle", () => {
  const queued = reduce(working(), { type: "send", message: sys("review") });
  assert.deepEqual(queued.effects, []);
  assert.deepEqual(queued.state.queue, [sys("review")]);
  const ended = run(queued.state, [{ type: "turnEnded", runId: "r1", ok: true, sessionId: "s1" }]);
  assert.deepEqual(ended.effects, [], "a turn's end alone does not drain: the process may have more to read");
  const idle = reduce(ended.state, { type: "idle" });
  assert.deepEqual(idle.effects, [{ type: "deliver", message: sys("review") }]);
  assert.equal(idle.state.status, "running");
  assert.equal(idle.state.queue.length, 0);
});

check("the agent queue drains one message per idle, in order", () => {
  const s = run(working(), [
    { type: "send", message: sys("x") },
    { type: "send", message: sys("y") },
    { type: "turnEnded", runId: "r1", ok: true },
  ]).state;
  const first = reduce(s, { type: "idle" });
  assert.deepEqual(first.effects.map((e) => e.message.id), ["x"]);
  const second = run(first.state, [{ type: "turnOpened", runId: "r2", prompt: "x", origin: "system" }, { type: "turnEnded", runId: "r2", ok: true }, { type: "idle" }]);
  assert.deepEqual(second.effects.map((e) => e.message.id), ["y"]);
});

check("an idle chat with an empty queue takes a system message at once", () => {
  const r = reduce(initialConversationState(), { type: "send", message: sys("wake") });
  assert.deepEqual(r.effects, [{ type: "deliver", message: sys("wake") }]);
});

check("a failure pauses the agent queue until the user acts", () => {
  const s = run(working(), [
    { type: "send", message: sys("x") },
    { type: "turnEnded", runId: "r1", ok: false },
    { type: "idle" },
  ]);
  assert.equal(s.state.status, "needs_attention");
  assert.deepEqual(s.effects, []);
  assert.deepEqual(s.state.queue, [sys("x")], "kept, not dropped");
  assert.deepEqual(reduce(s.state, { type: "send", message: sys("y") }).effects, [], "more system messages wait too");
});

check("idle before the turn's end is reported changes nothing: the end settles it", () => {
  const r = reduce(working(), { type: "idle" });
  assert.equal(r.state.status, "running");
  assert.equal(r.state.activeRunId, "r1");
});

check("a late end from another turn cannot clobber the active one", () => {
  const s = working();
  const r = reduce(s, { type: "turnEnded", runId: "old", ok: false, sessionId: "zzz" });
  assert.equal(r.state, s);
});

check("a turn's end hands on its session", () => {
  const r = reduce(working(), { type: "turnEnded", runId: "r1", ok: true, sessionId: "s9" });
  assert.equal(r.state.sessionId, "s9");
  assert.equal(r.state.activeRunId, null);
  assert.equal(reduce(r.state, { type: "turnEnded", runId: "r1", ok: true, sessionId: null }).state.sessionId, "s9");
});

check("a CLI-started turn (a background task's report) makes the chat busy", () => {
  const r = reduce(initialConversationState(), { type: "turnOpened", runId: "bg", prompt: "Background work finished.", origin: "system" });
  assert.equal(r.state.status, "running");
  assert.equal(r.state.activeRunId, "bg");
});

check("retry sends the failed prompt again, with its origin", () => {
  const failed = run(initialConversationState(), [
    { type: "send", message: sys("fix") },
    { type: "turnOpened", runId: "r1", prompt: "fix", origin: "system" },
    { type: "turnEnded", runId: "r1", ok: false },
    { type: "idle" },
  ]).state;
  const r = reduce(failed, { type: "retry" });
  assert.equal(r.effects.length, 1);
  assert.equal(r.effects[0]!.message.text, "fix");
  assert.equal(r.effects[0]!.message.origin, "system");
  assert.equal(r.state.status, "running");
});

check("resume sends the continue prompt as the user's", () => {
  const failed = run(working(), [{ type: "turnEnded", runId: "r1", ok: false }, { type: "idle" }]).state;
  const r = reduce(failed, { type: "resume" });
  assert.equal(r.effects[0]!.message.text, RESUME_PROMPT);
  assert.equal(r.effects[0]!.message.origin, "user");
});

check("retry and resume do nothing unless the chat needs attention", () => {
  for (const type of ["retry", "resume"] as const) {
    assert.deepEqual(reduce(working(), { type }).effects, []);
    assert.deepEqual(reduce(initialConversationState(), { type }).effects, []);
  }
});

check("the agent queue can be edited", () => {
  const s = run(working(), [{ type: "send", message: sys("x") }, { type: "send", message: sys("y") }]).state;
  assert.deepEqual(reduce(s, { type: "removeQueued", id: "x" }).state.queue, [sys("y")]);
  assert.deepEqual(reduce(s, { type: "clearQueue" }).state.queue, []);
});

console.log(`\n${passed} passed`);
