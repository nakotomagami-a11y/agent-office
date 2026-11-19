/**
 * Conversation SERVICE ↔ DB ↔ machine integration. A throwaway in-memory SQLite (getDb() global
 * override) and a fake runner standing in for the live CLI process: it records what was delivered,
 * and the test plays the process's reports (a turn opened, ended, the process idle or gone).
 *
 *   pnpm --filter @agent-office/domain test src/services/execution/conversation.test.ts
 */
import assert from "node:assert";
import Database from "better-sqlite3";
import { createSchema } from "../db/migrations";
import * as db from "../db";
import * as convo from "./conversation";
import type { ConversationRunner } from "./conversation";
import type { DeliverResult, SessionInput } from "./chat-session";

const mem = new Database(":memory:");
mem.pragma("foreign_keys = ON");
createSchema(mem);
globalThis.__agentOfficeDb = mem;

interface Delivery { convId: string; input: SessionInput; maxBudgetUsd?: number }
const delivered: Delivery[] = [];
const busy = new Set<string>();
const live = new Set<string>();
const closed: string[] = [];
let failNext: DeliverResult | null = null;

const runner: ConversationRunner = {
  async deliver(conv, input, opts) {
    if (failNext) {
      const r = failNext;
      failNext = null;
      return r;
    }
    db.insertRunInput({ id: input.id, conversationId: conv.id, text: input.text, origin: input.origin, sentAt: Date.now() });
    delivered.push({ convId: conv.id, input, maxBudgetUsd: opts.maxBudgetUsd });
    busy.add(conv.id);
    live.add(conv.id);
    return { ok: true };
  },
  async redeliver(conv) {
    for (const input of db.listPendingInputs(conv.id)) delivered.push({ convId: conv.id, input });
    busy.add(conv.id);
    live.add(conv.id);
    return { ok: true };
  },
  isBusy: (convId) => busy.has(convId),
  hasLiveProcess: (convId) => live.has(convId),
  async close(convId) {
    closed.push(convId);
    busy.delete(convId);
    live.delete(convId);
  },
};

let n = 0;
/** The process read `inputId` with no turn open: a turn opens on it. */
async function openTurn(convId: string, inputId: string | null, prompt?: string): Promise<string> {
  n += 1;
  const runId = `run${n}`;
  const input = inputId ? db.getRunInput(inputId) : null;
  const text = input?.text ?? prompt ?? "Background work finished.";
  const origin = input?.origin ?? "system";
  const conv = db.getConversation(convId)!;
  db.insertRun({ id: runId, agentId: conv.agentId, agentName: conv.agentId, instanceId: conv.instanceId, status: "running", prompt: text, origin, model: "", effort: "", startedAt: Date.now() + n, conversationId: convId });
  if (inputId) db.markRunInputRead(inputId, runId, Date.now(), true);
  busy.add(convId);
  await convo.onSessionEvent({ type: "turnOpened", convId, runId, prompt: text, origin, inputId }, runner);
  return runId;
}

/** The turn's `result`: the run row ends, then the process reports idle unless it has more. */
async function endTurn(convId: string, runId: string, ok: boolean, sessionId: string | null = "sess", stillBusy = false): Promise<void> {
  mem.prepare("UPDATE runs SET status = ?, session_id = ? WHERE id = ?").run(ok ? "done" : "error", sessionId, runId);
  if (!stillBusy) busy.delete(convId);
  await convo.onRunFinished(runId, ok, sessionId, runner);
  if (!stillBusy) await convo.onSessionEvent({ type: "idle", convId }, runner);
}

const lastInput = (convId: string) => delivered.filter((d) => d.convId === convId).at(-1)!.input;

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`PASS  ${name}`);
}

const statusOf = (convId: string) => db.getConversation(convId)!.status;
const queueOf = (convId: string) => db.listQueue(convId).map((m) => m.text);

await check("a send goes to the agent; the turn it opens becomes active", async () => {
  const convId = (await convo.ensureConversationView("dev", "s1", "proj", runner)).id;
  await convo.sendMessage("dev", "s1", "proj", "a", runner);
  assert.equal(statusOf(convId), "running");
  assert.equal(lastInput(convId).text, "a");
  const run = await openTurn(convId, lastInput(convId).id);
  assert.equal(db.getConversation(convId)!.activeRunId, run);
  await endTurn(convId, run, true, "sess-1");
  assert.equal(statusOf(convId), "idle");
  assert.equal(db.getConversation(convId)!.sessionId, "sess-1");
});

await check("messages sent while the agent works go to it at once and show where it read them", async () => {
  const convId = (await convo.ensureConversationView("dev", "steer", "p", runner)).id;
  await convo.sendMessage("dev", "steer", "p", "build it", runner);
  const run = await openTurn(convId, lastInput(convId).id);
  const before = delivered.length;
  const v = await convo.sendMessage("dev", "steer", "p", "also add tests", runner);
  assert.equal(delivered.length, before + 1, "delivered, not queued");
  assert.equal(v.queue.length, 0);
  assert.deepEqual(v.pending.map((p) => p.text), ["also add tests"], "sent, not read yet");
  const steer = lastInput(convId);
  db.markRunInputRead(steer.id, run, Date.now(), false);
  await endTurn(convId, run, true);
  const after = convo.view(convId);
  assert.equal(after.pending.length, 0);
  assert.deepEqual(after.turns.at(-1)!.inputs?.map((i) => i.text), ["also add tests"]);
  assert.equal(after.turns.at(-1)!.prompt, "build it");
});

await check("Agent Office's message waits while the agent works and goes when it is idle", async () => {
  const convId = (await convo.ensureConversationView("dev", "sys", "p", runner)).id;
  await convo.sendMessage("dev", "sys", "p", "task", runner);
  const run = await openTurn(convId, lastInput(convId).id);
  const before = delivered.length;
  await convo.sendMessage("dev", "sys", "p", "review findings", runner, undefined, "system");
  assert.equal(delivered.length, before, "not delivered mid-task");
  assert.deepEqual(queueOf(convId), ["review findings"]);
  await endTurn(convId, run, true);
  assert.equal(lastInput(convId).text, "review findings");
  assert.equal(lastInput(convId).origin, "system");
  assert.equal(queueOf(convId).length, 0);
  assert.equal(statusOf(convId), "running");
});

await check("a turn's end while the process still has unread messages keeps the chat busy", async () => {
  const convId = (await convo.ensureConversationView("dev", "late", "p", runner)).id;
  await convo.sendMessage("dev", "late", "p", "one", runner);
  const run = await openTurn(convId, lastInput(convId).id);
  await convo.sendMessage("dev", "late", "p", "two", runner);
  await endTurn(convId, run, true, "sess", true);
  assert.equal(statusOf(convId), "running");
  const next = await openTurn(convId, lastInput(convId).id);
  assert.equal(db.getConversation(convId)!.activeRunId, next);
});

await check("a failure parks the agent queue, never the user's messages", async () => {
  const convId = (await convo.ensureConversationView("dev", "fail", "p", runner)).id;
  await convo.sendMessage("dev", "fail", "p", "task", runner);
  const run = await openTurn(convId, lastInput(convId).id);
  await convo.sendMessage("dev", "fail", "p", "queued-sys", runner, undefined, "system");
  await endTurn(convId, run, false);
  assert.equal(statusOf(convId), "needs_attention");
  assert.deepEqual(queueOf(convId), ["queued-sys"], "kept for later");
  await convo.sendMessage("dev", "fail", "p", "try this instead", runner);
  assert.equal(statusOf(convId), "running");
  assert.equal(lastInput(convId).text, "try this instead");
});

await check("retry sends the failed prompt again; the queue resumes after it", async () => {
  const convId = (await convo.ensureConversationView("dev", "retry", "p", runner)).id;
  await convo.sendMessage("dev", "retry", "p", "task", runner);
  await convo.sendMessage("dev", "retry", "p", "later", runner, undefined, "system");
  const run = await openTurn(convId, lastInput(convId).id);
  await endTurn(convId, run, false);
  await convo.retry(convId, runner);
  assert.equal(lastInput(convId).text, "task");
  const again = await openTurn(convId, lastInput(convId).id);
  await endTurn(convId, again, true);
  assert.equal(lastInput(convId).text, "later");
});

await check("a send the agent cannot get throws its code and leaves the chat as it was", async () => {
  const convId = (await convo.ensureConversationView("dev", "nospawn", "p", runner)).id;
  failNext = { ok: false, error: { status: 400, code: "worktree_missing", message: "cwd not a directory" } };
  await assert.rejects(convo.sendMessage("dev", "nospawn", "p", "hi", runner), (e: unknown) => e instanceof convo.DeliveryError && e.code === "worktree_missing");
  assert.equal(statusOf(convId), "idle");
});

await check("a provider refusal becomes the conversation's failed turn", async () => {
  const convId = (await convo.ensureConversationView("dev", "refused", "p", runner)).id;
  const conv = db.getConversation(convId)!;
  db.insertRun({ id: "refused-run", agentId: "dev", agentName: "dev", instanceId: conv.instanceId, status: "error", prompt: "hi", model: "", effort: "", startedAt: Date.now(), conversationId: convId });
  failNext = { ok: false, refusedRunId: "refused-run" };
  await convo.sendMessage("dev", "refused", "p", "hi", runner);
  assert.equal(db.getConversation(convId)!.activeRunId, "refused-run");
  await convo.onRunFinished("refused-run", false, null, runner);
  assert.equal(statusOf(convId), "needs_attention");
});

await check("a CLI-started turn (a background sub-agent reporting) is tracked like any other", async () => {
  const convId = (await convo.ensureConversationView("dev", "bg", "p", runner)).id;
  const run = await openTurn(convId, null, "sub work");
  assert.equal(statusOf(convId), "running");
  assert.equal(db.getConversation(convId)!.activeRunId, run);
  await endTurn(convId, run, true);
  assert.equal(statusOf(convId), "idle");
});

await check("unread messages left by a dead process go to a new one once the chat is idle", async () => {
  const convId = (await convo.ensureConversationView("dev", "restart", "p", runner)).id;
  db.insertRunInput({ id: "orphan-input", conversationId: convId, text: "still here?", origin: "user", sentAt: Date.now() });
  mem.prepare("UPDATE conversations SET status='running', active_run_id=NULL, updated_at=? WHERE id=?").run(Date.now() - 10 * 60_000, convId);
  const before = delivered.length;
  await convo.getReconciledView(convId, runner);
  assert.equal(delivered.length, before + 1);
  assert.equal(delivered.at(-1)!.input.text, "still here?");
  assert.equal(statusOf(convId), "running");
});

await check("self-heals a conversation stuck on an orphan-reaped run", async () => {
  const convId = (await convo.ensureConversationView("dev", "orphan", "p", runner)).id;
  await convo.sendMessage("dev", "orphan", "p", "will-be-orphaned", runner);
  const run = await openTurn(convId, lastInput(convId).id);
  busy.delete(convId);
  live.delete(convId);
  mem.prepare("UPDATE runs SET status='error', exit_code=-1 WHERE id=?").run(run);
  const healed = await convo.getReconciledView(convId, runner);
  assert.equal(healed.status, "needs_attention");
  assert.equal(healed.activeRunId, null);
});

await check("startTurnIfIdle answers with the run the turn became", async () => {
  const convId = (await convo.ensureConversationView("dev", "loop", "p", runner)).id;
  const started = convo.startTurnIfIdle(convId, "fix round", "system", runner, 2);
  await new Promise((r) => setImmediate(r));
  const input = lastInput(convId);
  assert.equal(input.text, "fix round");
  assert.equal(delivered.at(-1)!.maxBudgetUsd, 2);
  const run = await openTurn(convId, input.id);
  assert.deepEqual(await started, { runId: run });
});

await check("a scheduled resume starts a chat parked on a failed turn; a loop round still waits", async () => {
  const convId = (await convo.ensureConversationView("dev", "parked", "p", runner)).id;
  await convo.sendMessage("dev", "parked", "p", "limited", runner);
  const run = await openTurn(convId, lastInput(convId).id);
  await endTurn(convId, run, false);
  assert.equal(statusOf(convId), "needs_attention");
  assert.deepEqual(await convo.startTurnIfIdle(convId, "fix", "system", runner), { code: "already_running" });
  const started = convo.startTurnIfIdle(convId, "Continue after the rate limit", "user", runner, undefined, true);
  await new Promise((r) => setImmediate(r));
  const resumed = await openTurn(convId, lastInput(convId).id);
  assert.deepEqual(await started, { runId: resumed });
  assert.equal(statusOf(convId), "running");
});

await check("a thread replaced by New thread takes no message: it would be a second agent on the seat", async () => {
  const oldId = (await convo.ensureConversationView("dev", "replaced", "p", runner)).id;
  await convo.newThread("dev", "replaced", "p", runner);
  const before = delivered.length;
  await assert.rejects(convo.sendMessageToConversation(oldId, "hi", runner), (e: unknown) => e instanceof convo.DeliveryError && e.code === "conversation_not_current");
  assert.equal(delivered.length, before);
});

await check("a dying process clears only the waits for what it held", async () => {
  const convId = (await convo.ensureConversationView("dev", "succession", "p", runner)).id;
  const started = convo.startTurnIfIdle(convId, "round", "system", runner);
  await new Promise((r) => setImmediate(r));
  const held = lastInput(convId).id;
  await convo.onSessionEvent({ type: "exited", convId, sessionId: null, unreadIds: ["someone-else"] }, runner);
  const run = await openTurn(convId, held);
  assert.deepEqual(await started, { runId: run }, "the successor's message still opens its turn");
});

await check("startTurnIfIdle refuses a busy chat, and one with a waiting queue", async () => {
  const convId = (await convo.ensureConversationView("dev", "busy", "p", runner)).id;
  await convo.sendMessage("dev", "busy", "p", "task", runner);
  assert.deepEqual(await convo.startTurnIfIdle(convId, "fix", "system", runner), { code: "already_running" });
});

await check("removeQueued / clearQueue edit the agent queue", async () => {
  const convId = (await convo.ensureConversationView("dev", "mgmt", "p", runner)).id;
  await convo.sendMessage("dev", "mgmt", "p", "run-me", runner);
  await convo.sendMessage("dev", "mgmt", "p", "q1", runner, undefined, "system");
  await convo.sendMessage("dev", "mgmt", "p", "q2", runner, undefined, "system");
  convo.removeQueued(convId, db.listQueue(convId)[0]!.id);
  assert.deepEqual(queueOf(convId), ["q2"]);
  convo.clearQueue(convId);
  assert.equal(queueOf(convId).length, 0);
  assert.equal(statusOf(convId), "running");
});

await check("newThread stops the old process and starts a fresh conversation", async () => {
  const oldId = (await convo.ensureConversationView("dev", "nt", "p", runner)).id;
  await convo.sendMessage("dev", "nt", "p", "old-run", runner);
  const fresh = await convo.newThread("dev", "nt", "p", runner);
  assert.notEqual(fresh.id, oldId);
  assert.ok(closed.includes(oldId));
  assert.equal(fresh.status, "idle");
  assert.equal(fresh.sessionId, null);
  assert.equal(db.getActiveConversation("dev", "nt")!.id, fresh.id);
});

await check("onRunFinished ignores an unknown / non-conversation run", async () => {
  const convId = db.getActiveConversation("dev", "s1")!.id;
  const before = db.getConversation(convId)!;
  await convo.onRunFinished("no-such-run", true, "x", runner);
  assert.equal(db.getConversation(convId)!.status, before.status);
});

console.log(`\n${passed} passed`);
