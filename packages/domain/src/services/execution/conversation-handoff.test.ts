/**
 * Session handoff through the conversation service: a reply ending in the
 * handoff marker continues in a fresh conversation for the same slot. Same
 * in-memory SQLite + fake runner as conversation.test.ts.
 *
 *   pnpm --filter @agent-office/domain test src/services/execution/conversation-handoff.test.ts
 */
import assert from "node:assert";
import Database from "better-sqlite3";
import { createSchema } from "../db/migrations";
import * as db from "../db";
import * as convo from "./conversation";
import type { ConversationRunner, StartRunInput } from "./conversation";
import { HANDOFF_MARKER, HANDOFF_PROMPT_HEAD, MAX_AUTO_HANDOFFS } from "../../config/handoff";

const mem = new Database(":memory:");
mem.pragma("foreign_keys = ON");
createSchema(mem);
globalThis.__agentOfficeDb = mem;

const started: StartRunInput[] = [];
let n = 0;
const runner: ConversationRunner = {
  async startRun(input) {
    const runId = `run${++n}`;
    started.push(input);
    db.insertRun({ id: runId, agentId: input.agentId, agentName: input.agentId, instanceId: input.instanceId, status: "running",
      prompt: input.prompt, origin: input.origin, model: "", effort: "", startedAt: Date.now() + n, conversationId: input.conversationId });
    return runId;
  },
};

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`PASS  ${name}`);
}

function statusOf(convId: string) { return db.getConversation(convId)!.status; }
function queueOf(convId: string) { return db.listQueue(convId).map((m) => m.text); }

const finishWith = (runId: string, output: string) =>
  db.updateRun(runId, { status: "done", output, tokensIn: 0, tokensOut: 0, costUsd: 0, durMs: 1, endedAt: Date.now() });

/** Finish the slot's running turn with `output`; returns the slot's conversation id afterwards. */
async function finishActive(slot: string, output: string): Promise<string> {
  const runId = db.getActiveConversation("dev", slot)!.activeRunId!;
  finishWith(runId, output);
  await convo.onRunFinished(runId, true, `sess-${runId}`, runner);
  return db.getActiveConversation("dev", slot)!.id;
}

const lastStart = () => started[started.length - 1]!;

function insertLoop(id: string, convId: string, slot: string, goal: string, binding: string | null) {
  mem.prepare(
    `INSERT INTO loops (id, conversation_id, agent_id, instance_id, project_id, reviewer_agent_id, cwd, goal, phase, round,
       spent_usd, started_at, binding, config_json, open_json, history_json, active_run_id, created_at, updated_at)
     VALUES (?, ?, 'dev', ?, 'p', 'qa', NULL, ?, ?, 1, 0, 0, ?, '{}', '[]', '[]', NULL, 0, 0)`,
  ).run(id, convId, slot, goal, binding ? "done" : "reviewing", binding);
}
const handoffReply = (text: string) => `${text}\n\n${HANDOFF_MARKER}\n`;

await check("a reply ending in the handoff marker continues in a fresh session, queue and all", async () => {
  const oldId = (await convo.ensureConversationView("dev", "ho", "p", runner)).id;
  await convo.sendMessage("dev", "ho", "p", "build the parser", runner);
  await convo.sendMessage("dev", "ho", "p", "queued", runner, undefined, "system");
  const newId = await finishActive("ho", handoffReply("Half done. Next: step 3."));
  assert.notEqual(newId, oldId);
  assert.equal(statusOf(oldId), "idle");
  assert.deepEqual(queueOf(oldId), []);
  assert.deepEqual(queueOf(newId), ["queued"]);
  const takeover = lastStart();
  assert.equal(takeover.conversationId, newId);
  assert.equal(takeover.origin, "system");
  assert.equal(takeover.resumeSessionId, null, "a fresh session, not a resume of the spent one");
  assert.ok(takeover.prompt.startsWith(HANDOFF_PROMPT_HEAD));
  assert.ok(takeover.prompt.includes("> Half done. Next: step 3."));
  assert.ok(takeover.prompt.includes("> build the parser"), "the user's request travels with every hop");
  assert.ok(!takeover.prompt.includes(HANDOFF_MARKER));
});

await check("a send to the replaced conversation lands in the current one", async () => {
  const current = db.getActiveConversation("dev", "ho")!.id;
  const oldId = mem.prepare("SELECT id FROM conversations WHERE instance_id='ho' AND id != ?").get(current) as { id: string };
  const v = await convo.sendMessageToConversation(oldId.id, "late message", runner);
  assert.equal(v.id, current);
  assert.deepEqual(queueOf(current), ["queued", "late message"]);
  assert.equal(statusOf(oldId.id), "idle");
});

await check("the marker anywhere but the end is not a handoff", async () => {
  const id = (await convo.ensureConversationView("dev", "mid", "p", runner)).id;
  await convo.sendMessage("dev", "mid", "p", "explain the handoff", runner);
  assert.equal(await finishActive("mid", `It is the line ${HANDOFF_MARKER} at the end of a reply.`), id);
  assert.equal(statusOf(id), "idle");
});

await check(`automatic takeovers stop after ${MAX_AUTO_HANDOFFS} in a row; a user message resets the count`, async () => {
  await convo.ensureConversationView("dev", "chain", "p", runner);
  await convo.sendMessage("dev", "chain", "p", "endless task", runner);
  const ids = [db.getActiveConversation("dev", "chain")!.id];
  for (let i = 0; i <= MAX_AUTO_HANDOFFS; i++) ids.push(await finishActive("chain", handoffReply("more")));
  assert.equal(new Set(ids).size, MAX_AUTO_HANDOFFS + 1, "the last marker does not start another session");
  const last = ids[ids.length - 1]!;
  assert.equal(statusOf(last), "idle");
  await convo.sendMessage("dev", "chain", "p", "keep going", runner);
  assert.notEqual(await finishActive("chain", handoffReply("more")), last);
});

await check("/handoff by the user ends an automatic chain", async () => {
  await convo.ensureConversationView("dev", "reset", "p", runner);
  await convo.sendMessage("dev", "reset", "p", "long task", runner);
  for (let i = 0; i < MAX_AUTO_HANDOFFS; i++) await finishActive("reset", handoffReply("more"));
  const capped = await finishActive("reset", handoffReply("more"));
  const v = await convo.handOff(capped, runner);
  assert.ok(!("code" in v));
  assert.equal(lastStart().origin, "user");
  assert.notEqual(await finishActive("reset", handoffReply("more")), v.id, "the chain starts again from zero");
});

await check("a queued user message runs after one takeover instead of being pushed behind another", async () => {
  await convo.ensureConversationView("dev", "stop", "p", runner);
  await convo.sendMessage("dev", "stop", "p", "task", runner);
  await convo.sendMessage("dev", "stop", "p", "stop, wrong approach", runner);
  const fresh = await finishActive("stop", handoffReply("first hop"));
  assert.equal(await finishActive("stop", handoffReply("second hop")), fresh);
  assert.equal(lastStart().prompt, "stop, wrong approach");
});

await check("no automatic takeover while a review loop drives the chat", async () => {
  const id = (await convo.ensureConversationView("dev", "loop", "p", runner)).id;
  await convo.sendMessage("dev", "loop", "p", "task", runner);
  insertLoop("L1", id, "loop", "g", null);
  assert.equal(await finishActive("loop", handoffReply("more")), id);
  assert.deepEqual(await convo.handOff(id, runner), { code: "loop_running" });
});

await check("/handoff refuses while running, with no turn, and on a replaced conversation", async () => {
  const id = (await convo.ensureConversationView("dev", "manual", "p", runner)).id;
  assert.deepEqual(await convo.handOff(id, runner), { code: "nothing_to_hand_off" });
  await convo.sendMessage("dev", "manual", "p", "work", runner);
  assert.deepEqual(await convo.handOff(id, runner), { code: "turn_running" });
  await finishActive("manual", "Stopped without a marker.");
  const v = await convo.handOff(id, runner);
  assert.ok(!("code" in v) && v.id !== id && v.status === "running");
  assert.ok(lastStart().prompt.includes("> Stopped without a marker."));
  assert.deepEqual(await convo.handOff(id, runner), { code: "not_current" }, "a second /handoff makes no third thread");
});

await check("/handoff from needs_attention cancels the spent session's scheduled resume", async () => {
  const id = (await convo.ensureConversationView("dev", "spent", "p", runner)).id;
  await convo.sendMessage("dev", "spent", "p", "work", runner);
  await convo.onRunFinished(db.getConversation(id)!.activeRunId!, false, "sess-spent", runner);
  db.insertScheduledJob({
    id: "job1", fireAt: Date.now() + 60_000, reason: "rate-limit", label: "resume", status: "pending", attempts: 0,
    summonRequest: { agentId: "dev", prompt: "continue", conversationId: id }, createdAt: 0, updatedAt: 0,
  });
  const v = await convo.handOff(id, runner);
  assert.ok(!("code" in v) && v.id !== id);
  assert.equal(db.getScheduledJob("job1")!.status, "cancelled");
});

await check("a takeover that cannot start parks the fresh thread with the takeover and queue kept", async () => {
  await convo.ensureConversationView("dev", "nostart", "p", runner);
  await convo.sendMessage("dev", "nostart", "p", "task", runner);
  await convo.sendMessage("dev", "nostart", "p", "next", runner, undefined, "system");
  const runId = db.getActiveConversation("dev", "nostart")!.activeRunId!;
  finishWith(runId, handoffReply("more"));
  const failing: ConversationRunner = { startRun: () => Promise.reject(new Error("claude unavailable")) };
  await convo.onRunFinished(runId, true, "s", failing);
  const fresh = db.getActiveConversation("dev", "nostart")!;
  assert.equal(fresh.status, "needs_attention");
  const queue = queueOf(fresh.id);
  assert.ok(queue[0]!.startsWith(HANDOFF_PROMPT_HEAD));
  assert.equal(queue[1], "next");
});

await check("Retry on a replaced conversation returns the current one and starts nothing", async () => {
  const oldId = (await convo.ensureConversationView("dev", "stale", "p", runner)).id;
  await convo.sendMessage("dev", "stale", "p", "work", runner);
  await convo.onRunFinished(db.getConversation(oldId)!.activeRunId!, false, null, runner);
  const fresh = convo.newThread("dev", "stale", "p").id;
  const before = started.length;
  assert.equal((await convo.retry(oldId, runner)).id, fresh);
  assert.equal((await convo.resume(oldId, runner)).id, fresh);
  assert.equal(started.length, before);
  assert.equal(statusOf(oldId), "needs_attention");
});

await check("a stale Clear never empties another conversation's queue; a stale cancel follows its message", async () => {
  const oldId = (await convo.ensureConversationView("dev", "clear", "p", runner)).id;
  await convo.sendMessage("dev", "clear", "p", "running", runner);
  await convo.sendMessage("dev", "clear", "p", "keep", runner);
  await convo.sendMessage("dev", "clear", "p", "cancel me", runner);
  const freshId = await finishActive("clear", handoffReply("more"));
  const v = convo.clearQueue(oldId);
  assert.equal(v.id, freshId, "the stale client is shown the current thread");
  assert.deepEqual(queueOf(freshId), ["keep", "cancel me"]);
  const cancel = db.listQueue(freshId).find((m) => m.text === "cancel me")!;
  convo.removeQueued(oldId, cancel.id);
  assert.deepEqual(queueOf(freshId), ["keep"]);
});

await check("an automated turn that hands off after an old request does not quote that request", async () => {
  await convo.ensureConversationView("dev", "digest", "p", runner);
  await convo.sendMessage("dev", "digest", "p", "finished old task", runner);
  await finishActive("digest", "done");
  await convo.sendMessage("dev", "digest", "p", "mission digest", runner, undefined, "system");
  await finishActive("digest", handoffReply("more"));
  assert.ok(lastStart().prompt.startsWith(HANDOFF_PROMPT_HEAD));
  assert.ok(!lastStart().prompt.includes("finished old task"));
});

await check("after review-loop rounds, the takeover quotes the loop's request", async () => {
  const id = (await convo.ensureConversationView("dev", "looped", "p", runner)).id;
  await convo.sendMessage("dev", "looped", "p", "build the outbox", runner);
  await finishActive("looped", "done");
  const goal = "build the outbox\n\nFiles that turn edited:\n- outbox.ts";
  insertLoop("L2", id, "looped", goal, "converged");
  await convo.sendMessage("dev", "looped", "p", `Round 2. Fix EXACTLY these findings against the goal:\n${goal}`, runner, undefined, "system");
  await finishActive("looped", "fixed");
  const v = await convo.handOff(id, runner);
  assert.ok(!("code" in v));
  assert.ok(lastStart().prompt.includes("> build the outbox\n"), "the loop's request, without its file list");
  assert.ok(!lastStart().prompt.includes("Files that turn edited"));
});

console.log(`\n${passed} passed`);
