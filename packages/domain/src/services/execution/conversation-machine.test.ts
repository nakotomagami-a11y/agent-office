/**
 * Locks in the exact failure modes from the chat incidents. Pure reducer, no
 * I/O — every reliability guarantee is asserted here.
 *
 *   npx tsx packages/domain/src/services/execution/conversation-machine.test.ts
 */
import assert from "node:assert";
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

const msg = (id: string, text = id) => ({ id, text });

/** Apply a sequence of actions, collecting all effects in order. */
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

// 1. Idle send starts immediately.
check("idle send starts a run", () => {
  const r = reduce(initialConversationState(), { type: "send", message: msg("a") });
  assert.equal(r.state.status, "running");
  assert.equal(r.state.lastPrompt, "a");
  assert.deepEqual(r.effects, [{ type: "startRun", prompt: "a", resumeSessionId: null }]);
});

// 2. Sending while running queues (no second concurrent run).
check("send while running queues, no effect", () => {
  const { state, effects } = run(initialConversationState(), [
    { type: "send", message: msg("a") },
    { type: "runStarted", runId: "r1" },
    { type: "send", message: msg("b") },
  ]);
  assert.equal(state.status, "running");
  assert.equal(state.activeRunId, "r1");
  assert.deepEqual(state.queue.map((m) => m.id), ["b"]);
  assert.equal(effects.length, 1); // only the first startRun
});

// 3. FIFO drain order on successful finishes.
check("queue drains strictly FIFO on success", () => {
  const { state, effects } = run(initialConversationState(), [
    { type: "send", message: msg("a") },
    { type: "runStarted", runId: "r1" },
    { type: "send", message: msg("b") },
    { type: "send", message: msg("c") },
    { type: "runFinished", runId: "r1", ok: true, sessionId: "s1" },
    { type: "runStarted", runId: "r2" },
    { type: "runFinished", runId: "r2", ok: true, sessionId: "s1" },
    { type: "runStarted", runId: "r3" },
    { type: "runFinished", runId: "r3", ok: true, sessionId: "s1" },
  ]);
  assert.deepEqual(effects.map((e) => e.prompt), ["a", "b", "c"]);
  assert.equal(state.status, "idle");
  assert.equal(state.queue.length, 0);
  // Session captured on first success is reused for later turns.
  assert.deepEqual(
    effects.map((e) => e.resumeSessionId),
    [null, "s1", "s1"],
  );
});

// 4. A failed turn does NOT auto-advance and does NOT re-run.
check("failure pauses: needs_attention, queue preserved, no effect", () => {
  const { state, effects } = run(initialConversationState(), [
    { type: "send", message: msg("a") },
    { type: "runStarted", runId: "r1" },
    { type: "send", message: msg("queued-1") },
    { type: "send", message: msg("queued-2") },
    { type: "runFinished", runId: "r1", ok: false },
  ]);
  assert.equal(state.status, "needs_attention");
  assert.equal(state.activeRunId, null);
  assert.deepEqual(state.queue.map((m) => m.id), ["queued-1", "queued-2"]); // intact
  assert.equal(effects.length, 1); // only the original startRun for "a" — nothing auto-fired
});

// 5. Retry re-runs the failed prompt, then the preserved queue resumes.
check("retry then success resumes the preserved queue", () => {
  const { state, effects } = run(initialConversationState(), [
    { type: "send", message: msg("a") },
    { type: "runStarted", runId: "r1" },
    { type: "send", message: msg("b") },
    { type: "runFinished", runId: "r1", ok: false },
    { type: "retry" },
    { type: "runStarted", runId: "r2" },
    { type: "runFinished", runId: "r2", ok: true, sessionId: "s1" },
    { type: "runStarted", runId: "r3" },
    { type: "runFinished", runId: "r3", ok: true, sessionId: "s1" },
  ]);
  assert.deepEqual(effects.map((e) => e.prompt), ["a", "a", "b"]); // retry re-ran "a", then "b"
  assert.equal(state.status, "idle");
  assert.equal(state.queue.length, 0);
});

// 6. Resume continues the session, then the queue resumes.
check("resume runs the continue-prompt, then drains queue", () => {
  const { state, effects } = run(initialConversationState(), [
    { type: "send", message: msg("a") },
    { type: "runStarted", runId: "r1" },
    { type: "send", message: msg("b") },
    { type: "runFinished", runId: "r1", ok: false, sessionId: "s1" },
    { type: "resume" },
    { type: "runStarted", runId: "r2" },
    { type: "runFinished", runId: "r2", ok: true, sessionId: "s1" },
  ]);
  assert.equal(effects[1]!.prompt, RESUME_PROMPT);
  assert.equal(effects[1]!.resumeSessionId, "s1"); // resumes the failed run's session
  assert.equal(state.status, "running"); // draining "b"
  assert.equal(effects[2]!.prompt, "b");
});

// 7. Skip discards the failed turn and advances.
check("skip discards failed turn and advances", () => {
  const { state, effects } = run(initialConversationState(), [
    { type: "send", message: msg("a") },
    { type: "runStarted", runId: "r1" },
    { type: "send", message: msg("b") },
    { type: "runFinished", runId: "r1", ok: false },
    { type: "skip" },
  ]);
  assert.equal(effects[effects.length - 1]!.prompt, "b");
  assert.equal(state.status, "running");
  assert.equal(state.queue.length, 0);
});

// 8. Skip with empty queue → idle.
check("skip with empty queue goes idle", () => {
  const { state } = run(initialConversationState(), [
    { type: "send", message: msg("a") },
    { type: "runStarted", runId: "r1" },
    { type: "runFinished", runId: "r1", ok: false },
    { type: "skip" },
  ]);
  assert.equal(state.status, "idle");
});

// 9. A finish for a non-active run is ignored (late/superseded finish guard).
check("stale runFinished is ignored", () => {
  const { state, effects } = run(initialConversationState(), [
    { type: "send", message: msg("a") },
    { type: "runStarted", runId: "r1" },
    { type: "runFinished", runId: "OLD", ok: true, sessionId: "sX" }, // not the active run
  ]);
  assert.equal(state.status, "running");
  assert.equal(state.activeRunId, "r1");
  assert.equal(state.sessionId, null); // stale session not adopted
  assert.equal(effects.length, 1);
});

// 10. clearQueue / removeQueued only touch the queue.
check("clearQueue and removeQueued manage pending items", () => {
  const base = run(initialConversationState(), [
    { type: "send", message: msg("a") },
    { type: "runStarted", runId: "r1" },
    { type: "send", message: msg("b") },
    { type: "send", message: msg("c") },
  ]).state;
  const removed = reduce(base, { type: "removeQueued", id: "b" }).state;
  assert.deepEqual(removed.queue.map((m) => m.id), ["c"]);
  const cleared = reduce(base, { type: "clearQueue" }).state;
  assert.equal(cleared.queue.length, 0);
  assert.equal(cleared.status, "running"); // clearing the queue doesn't stop the active run
});

// 11. Resolving actions are no-ops unless needs_attention (can't retry a healthy run).
check("retry/resume/skip are no-ops when not needs_attention", () => {
  const running = run(initialConversationState(), [
    { type: "send", message: msg("a") },
    { type: "runStarted", runId: "r1" },
  ]).state;
  for (const type of ["retry", "resume", "skip"] as const) {
    const r = reduce(running, { type });
    assert.equal(r.state.status, "running");
    assert.equal(r.effects.length, 0);
  }
});

console.log(`\n${passed} passed`);
