/**
 * Conversation SERVICE ↔ DB ↔ machine integration. Uses a throwaway in-memory
 * SQLite (getDb() global override) and a fake runner that records startRun
 * calls and inserts run rows — so the full send/queue/finish/fail/retry/skip
 * lifecycle is exercised end-to-end without spawning `claude`.
 *
 *   npx tsx packages/domain/src/services/execution/conversation.test.ts
 */
import assert from "node:assert";
import Database from "better-sqlite3";
import { createSchema } from "../db/migrations";
import * as db from "../db";
import * as convo from "./conversation";
import type { ConversationRunner, StartRunInput } from "./conversation";

const mem = new Database(":memory:");
mem.pragma("foreign_keys = ON");
createSchema(mem);
globalThis.__agentOfficeDb = mem;

// Fake runner: assigns sequential run ids, records each call, and inserts a
// matching run row (as the real startRun does) so conversationId lookups +
// latest-turn derivation work.
const started: StartRunInput[] = [];
let n = 0;
const runner: ConversationRunner = {
  async startRun(input) {
    n += 1;
    const runId = `run${n}`;
    started.push(input);
    db.insertRun({
      id: runId, agentId: input.agentId, agentName: input.agentId,
      instanceId: input.instanceId, status: "running", prompt: input.prompt,
      model: "", effort: "", startedAt: Date.now() + n, conversationId: input.conversationId,
    });
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

await check("send while idle starts a run; queues while running", async () => {
  const v0 = await convo.ensureConversationView("dev", "s1", "proj", runner);
  const convId = v0.id;
  await convo.sendMessage("dev", "s1", "proj", "a", runner);
  assert.equal(statusOf(convId), "running");
  assert.equal(db.getConversation(convId)!.activeRunId, "run1");
  await convo.sendMessage("dev", "s1", "proj", "b", runner);
  await convo.sendMessage("dev", "s1", "proj", "c", runner);
  assert.deepEqual(queueOf(convId), ["b", "c"]);
  assert.equal(started.length, 1); // only "a" started
});

await check("success advances the queue FIFO, reusing the session", async () => {
  const convId = db.getActiveConversation("dev", "s1")!.id;
  await convo.onRunFinished("run1", true, "sess-1", runner);
  assert.equal(started[1]!.prompt, "b");
  assert.equal(started[1]!.resumeSessionId, "sess-1"); // session captured + reused
  assert.deepEqual(queueOf(convId), ["c"]);
  await convo.onRunFinished("run2", true, "sess-1", runner);
  assert.equal(started[2]!.prompt, "c");
  await convo.onRunFinished("run3", true, "sess-1", runner);
  assert.equal(statusOf(convId), "idle");
  assert.equal(queueOf(convId).length, 0);
});

await check("failure parks in needs_attention with the queue preserved", async () => {
  const v = await convo.ensureConversationView("dev", "fail", "p", runner);
  const convId = v.id;
  await convo.sendMessage("dev", "fail", "p", "task", runner);
  const activeRun = db.getConversation(convId)!.activeRunId!;
  await convo.sendMessage("dev", "fail", "p", "queued-1", runner);
  await convo.sendMessage("dev", "fail", "p", "queued-2", runner);
  const before = started.length;
  await convo.onRunFinished(activeRun, false, null, runner);
  assert.equal(statusOf(convId), "needs_attention");
  assert.equal(db.getConversation(convId)!.activeRunId, null);
  assert.deepEqual(queueOf(convId), ["queued-1", "queued-2"]); // intact
  assert.equal(started.length, before); // nothing auto-started
});

await check("retry re-runs the failed prompt, then the queue resumes", async () => {
  const convId = db.getActiveConversation("dev", "fail")!.id;
  await convo.retry(convId, runner);
  assert.equal(statusOf(convId), "running");
  assert.equal(started[started.length - 1]!.prompt, "task"); // re-ran the failed turn
  const retryRun = db.getConversation(convId)!.activeRunId!;
  await convo.onRunFinished(retryRun, true, "sess-f", runner);
  assert.equal(started[started.length - 1]!.prompt, "queued-1"); // queue resumed
  assert.deepEqual(queueOf(convId), ["queued-2"]);
});

await check("skip discards the failed turn and advances", async () => {
  const v = await convo.ensureConversationView("dev", "skip", "p", runner);
  const convId = v.id;
  await convo.sendMessage("dev", "skip", "p", "boom", runner);
  const run = db.getConversation(convId)!.activeRunId!;
  await convo.sendMessage("dev", "skip", "p", "next", runner);
  await convo.onRunFinished(run, false, null, runner);
  assert.equal(statusOf(convId), "needs_attention");
  await convo.skip(convId, runner);
  assert.equal(statusOf(convId), "running");
  assert.equal(started[started.length - 1]!.prompt, "next");
  assert.equal(queueOf(convId).length, 0);
});

await check("onRunFinished ignores an unknown / non-conversation run", async () => {
  const convId = db.getActiveConversation("dev", "s1")!.id;
  const before = db.getConversation(convId)!;
  await convo.onRunFinished("no-such-run", true, "x", runner); // no-op
  const after = db.getConversation(convId)!;
  assert.equal(after.status, before.status);
});

await check("removeQueued / clearQueue manage pending items", async () => {
  const v = await convo.ensureConversationView("dev", "mgmt", "p", runner);
  const convId = v.id;
  await convo.sendMessage("dev", "mgmt", "p", "run-me", runner); // starts (idle→running)
  await convo.sendMessage("dev", "mgmt", "p", "q1", runner);
  await convo.sendMessage("dev", "mgmt", "p", "q2", runner);
  const q1Id = db.listQueue(convId)[0]!.id;
  convo.removeQueued(convId, q1Id);
  assert.deepEqual(queueOf(convId), ["q2"]);
  convo.clearQueue(convId);
  assert.equal(queueOf(convId).length, 0);
  assert.equal(statusOf(convId), "running"); // clearing queue doesn't stop the active run
});

await check("newThread starts a fresh conversation, old queue abandoned", async () => {
  const v = await convo.ensureConversationView("dev", "nt", "p", runner);
  const oldId = v.id;
  await convo.sendMessage("dev", "nt", "p", "old-run", runner);
  await convo.sendMessage("dev", "nt", "p", "old-queued", runner);
  const fresh = convo.newThread("dev", "nt", "p");
  assert.notEqual(fresh.id, oldId);
  assert.equal(fresh.status, "idle");
  assert.equal(fresh.sessionId, null);
  assert.equal(fresh.queue.length, 0);
  assert.equal(db.getActiveConversation("dev", "nt")!.id, fresh.id); // new one is current
  assert.deepEqual(queueOf(oldId), ["old-queued"]); // old queue still there, just abandoned
});

await check("self-heals a conversation stuck on an orphan-reaped run", async () => {
  // Simulate the real gap: reapOrphanedRuns (db/connection.ts) marks a
  // "running" run row as errored via raw SQL on server boot — completely
  // bypassing finalizeRun, so onRunFinished is never dispatched. The
  // conversation is left claiming status:"running" for a run that's dead.
  const v = await convo.ensureConversationView("dev", "orphan", "p", runner);
  const convId = v.id;
  await convo.sendMessage("dev", "orphan", "p", "will-be-orphaned", runner);
  await convo.sendMessage("dev", "orphan", "p", "queued-behind-it", runner);
  const orphanRunId = db.getConversation(convId)!.activeRunId!;
  assert.equal(statusOf(convId), "running");

  // The orphan-reap: direct SQL, no finalizeRun, no onRunFinished dispatch.
  mem.prepare("UPDATE runs SET status='error', exit_code=-1 WHERE id=?").run(orphanRunId);

  // Conversation is now LYING — still says "running" for a dead run. A read
  // must self-heal it, and the preserved queue must still be there.
  const healed = await convo.getReconciledView(convId, runner);
  assert.equal(healed.status, "needs_attention");
  assert.equal(healed.activeRunId, null);
  assert.deepEqual(healed.queue.map((m) => m.text), ["queued-behind-it"]);

  // And a mutating action (not just a read) self-heals too, then proceeds
  // correctly from the healed state.
  const v2 = await convo.ensureConversationView("dev", "orphan2", "p", runner);
  const convId2 = v2.id;
  await convo.sendMessage("dev", "orphan2", "p", "also-orphaned", runner);
  const orphanRunId2 = db.getConversation(convId2)!.activeRunId!;
  mem.prepare("UPDATE runs SET status='done', exit_code=0, session_id='healed-session' WHERE id=?").run(orphanRunId2);
  const before = started.length;
  await convo.retry(convId2, runner); // retry on a "running"-looking-but-actually-done conv
  // Self-heal treats it as a clean finish (ok=true) -> idle, empty queue ->
  // retry() is then a no-op (nothing to retry once healed to idle/no failure).
  assert.equal(statusOf(convId2), "idle");
  assert.equal(started.length, before); // retry found nothing to do post-heal
});

console.log(`\n${passed} passed`);
