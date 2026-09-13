/**
 * Conversation service — binds the pure {@link reduce} state machine to the DB
 * and to the run engine. This is the ONE server-side driver of chat turns +
 * the durable queue (replaces the client's transcript blob + queue daemon).
 *
 * Flow: load the conversation's state from the DB → `reduce(state, action)` →
 * persist the next state → perform any `startRun` effect via the injected
 * {@link ConversationRunner}. The runner is injected so this whole layer is
 * unit-testable without spawning `claude` (see conversation.test.ts); the
 * production runner wraps `summon-run.startSummonRun`.
 *
 * See docs/chat-refactor.md.
 */
import * as db from "../db";
import { emitAppEvent } from "../infra/events";
import {
  reduce,
  type ConversationState,
  type ConversationAction,
} from "./conversation-machine";
// The client-safe shape lives in the pure types module (no better-sqlite3 /
// node:child_process deps) so browser code can import it directly — see that
// file's header comment. Re-exported here so existing `conversation.` callers
// keep working unchanged.
import type { ContextProfile, ConversationView } from "../../types/index";
export type { ConversationView } from "../../types/index";

export interface StartRunInput {
  agentId: string;
  instanceId: string;
  projectId: string | null;
  prompt: string;
  resumeSessionId: string | null;
  conversationId: string;
  /** Only meaningful when `resumeSessionId` is null (the first turn of a
   *  fresh session) — see `summon-run.ts`'s `buildPriorContext`, which
   *  short-circuits once a session exists. Threaded through from the send
   *  call (a per-message client preference), not stored on the conversation
   *  itself. */
  contextProfile?: ContextProfile;
}

/** Abstracts "spawn a run and give me its id". Throws if the run can't start. */
export interface ConversationRunner {
  startRun(input: StartRunInput): Promise<string>;
}

/** Reconstruct the machine's in-memory state from the durable DB rows. */
function buildState(conv: db.ConversationRow): ConversationState {
  const queue = db.listQueue(conv.id).map((m) => ({ id: m.id, text: m.text }));
  const lastPrompt = db.latestConversationTurn(conv.id)?.prompt ?? null;
  return {
    status: conv.status,
    activeRunId: conv.activeRunId,
    sessionId: conv.sessionId,
    lastPrompt,
    queue,
  };
}

/** Write a machine state back to the DB (conversation row + queue rows). */
function persist(convId: string, next: ConversationState): void {
  db.updateConversation(convId, {
    status: next.status,
    activeRunId: next.activeRunId,
    sessionId: next.sessionId,
  });
  db.replaceQueue(convId, next.queue.map((m) => ({ id: m.id, text: m.text })));
}

/**
 * Self-heal a conversation whose `activeRunId` points at a run that has
 * ALREADY finished/errored in the DB without ever going through
 * `finalizeRun`'s listener dispatch. This happens for real: server-restart
 * orphan-reaping (`reapOrphanedRuns` in db/connection.ts) updates the `runs`
 * row directly via raw SQL — it has no idea conversations exist and never
 * calls `onRunFinished`. Without this, a conversation can get stuck forever
 * reporting `status: "running"` for a run that is provably dead, silently
 * blocking every future send (they'd just queue behind a ghost).
 *
 * Called at the top of every mutating action AND on every read, so the
 * conversation is always self-consistent with the runs table by the time
 * anyone (client or dispatch) looks at or acts on it — no separate sweep job
 * needed. A no-op (single indexed SELECT) in the overwhelmingly common case
 * where the active run really is still running or there is none.
 */
async function reconcileIfStale(convId: string, runner: ConversationRunner): Promise<void> {
  const conv = db.getConversation(convId);
  if (!conv?.activeRunId) return;
  const run = db.getRun(conv.activeRunId);
  if (!run || run.status === "running") return; // genuinely live, or not persisted yet (just spawned)
  await apply(convId, { type: "runFinished", runId: run.id, ok: run.status === "done", sessionId: run.sessionId ?? null }, runner);
}

/**
 * Apply an action to a conversation, persist the result, and perform the
 * resulting `startRun` effect (if any). Returns the fresh view.
 *
 * A reduce yields at most one `startRun` effect. If the run engine refuses to
 * start (throws), the conversation is parked in `needs_attention` with its
 * queue intact — never lost — so the user can retry.
 */
async function apply(
  convId: string,
  action: ConversationAction,
  runner: ConversationRunner,
  opts: { contextProfile?: ContextProfile } = {},
): Promise<ConversationView> {
  // Skip reconciliation when the action itself IS a reconciling runFinished
  // dispatch — `reconcileIfStale` calling back into `apply` for that exact
  // action would otherwise recurse.
  if (action.type !== "runFinished") await reconcileIfStale(convId, runner);

  const conv = db.getConversation(convId);
  if (!conv) throw new Error(`conversation not found: ${convId}`);

  const { state: next, effects } = reduce(buildState(conv), action);
  persist(convId, next);

  const startEffect = effects.find((e) => e.type === "startRun");
  if (startEffect) {
    let runId: string;
    try {
      runId = await runner.startRun({
        agentId: conv.agentId,
        instanceId: conv.instanceId,
        projectId: conv.projectId,
        prompt: startEffect.prompt,
        resumeSessionId: startEffect.resumeSessionId,
        conversationId: convId,
        contextProfile: opts.contextProfile,
      });
    } catch {
      // Couldn't spawn — park for attention, keep the queue. The failed
      // start is not a turn (no run row), so there's nothing to retry-by-run;
      // the user can Retry (re-run lastPrompt) or Resume.
      db.updateConversation(convId, { status: "needs_attention", activeRunId: null });
      emitAppEvent("conversations:changed");
      return view(convId);
    }
    // Adopt the new runId as active (mirror the machine's `runStarted`).
    const conv2 = db.getConversation(convId)!;
    persist(convId, reduce(buildState(conv2), { type: "runStarted", runId }).state);
  }

  emitAppEvent("conversations:changed");
  return view(convId);
}

// ─── Public API (called by the HTTP routes + the finalizeRun hook) ────────────

/** Ensure a conversation exists for the slot, returning its (reconciled) view. */
export async function ensureConversationView(
  agentId: string,
  instanceId: string,
  projectId: string | null,
  runner: ConversationRunner,
): Promise<ConversationView> {
  const conv = db.ensureConversation(agentId, instanceId, projectId);
  return getReconciledView(conv.id, runner);
}

/** Send a user message: starts a run if idle, else appends to the queue. */
export async function sendMessage(
  agentId: string,
  instanceId: string,
  projectId: string | null,
  text: string,
  runner: ConversationRunner,
  contextProfile?: ContextProfile,
): Promise<ConversationView> {
  const conv = db.ensureConversation(agentId, instanceId, projectId);
  return sendMessageToConversation(conv.id, text, runner, contextProfile);
}

/** Send a user message directly to a known conversation id (the shape the
 *  `/api/conversations/:id/messages` route uses — the client already holds
 *  the id from a prior ensure/get call). `contextProfile` only matters if
 *  this happens to start a fresh (no prior session) turn — see StartRunInput. */
export function sendMessageToConversation(
  convId: string,
  text: string,
  runner: ConversationRunner,
  contextProfile?: ContextProfile,
): Promise<ConversationView> {
  const message = { id: cryptoRandomId(), text };
  return apply(convId, { type: "send", message }, runner, { contextProfile });
}

/**
 * A run finished. Looked up by the run's `conversationId` (top-level turns
 * only — sub-agent runs have no conversationId and are ignored). On success
 * the next queued message auto-starts; on failure the conversation parks in
 * `needs_attention` with the queue preserved.
 */
export async function onRunFinished(
  runId: string,
  ok: boolean,
  sessionId: string | null,
  runner: ConversationRunner,
): Promise<void> {
  const run = db.getRun(runId);
  const convId = run?.conversationId;
  if (!convId) return;
  if (!db.getConversation(convId)) return;
  await apply(convId, { type: "runFinished", runId, ok, sessionId }, runner);
}

export function retry(convId: string, runner: ConversationRunner): Promise<ConversationView> {
  return apply(convId, { type: "retry" }, runner);
}

export function resume(convId: string, runner: ConversationRunner): Promise<ConversationView> {
  return apply(convId, { type: "resume" }, runner);
}

export function skip(convId: string, runner: ConversationRunner): Promise<ConversationView> {
  return apply(convId, { type: "skip" }, runner);
}

export function removeQueued(convId: string, messageId: string): ConversationView {
  db.removeQueuedMessage(convId, messageId);
  return view(convId);
}

export function clearQueue(convId: string): ConversationView {
  db.clearQueue(convId);
  return view(convId);
}

/** Start a fresh conversation ("New thread") for the slot; abandons the old
 *  conversation + its queue. */
export function newThread(agentId: string, instanceId: string, projectId: string | null): ConversationView {
  const conv = db.startNewConversation(agentId, instanceId, projectId);
  return view(conv.id);
}

/** "New thread" starting from a known (old) conversation id — reads its slot
 *  (agentId/instanceId/projectId) and starts a fresh conversation for it. The
 *  shape the `/api/conversations/:id/new` route uses. */
export function newThreadFromConversation(oldConvId: string): ConversationView {
  const old = db.getConversation(oldConvId);
  if (!old) throw new Error(`conversation not found: ${oldConvId}`);
  return newThread(old.agentId, old.instanceId, old.projectId);
}

/** Read-path variant of `view()` that self-heals first (see
 *  `reconcileIfStale`) — used by the GET routes so a client never observes a
 *  conversation stuck on a run that's actually already dead. */
export async function getReconciledView(convId: string, runner: ConversationRunner): Promise<ConversationView> {
  await reconcileIfStale(convId, runner);
  return view(convId);
}

/** Assemble the full view (conversation row + turns + queue) for a conversation. */
export function view(convId: string): ConversationView {
  const conv = db.getConversation(convId);
  if (!conv) throw new Error(`conversation not found: ${convId}`);
  return {
    id: conv.id,
    agentId: conv.agentId,
    instanceId: conv.instanceId,
    projectId: conv.projectId,
    status: conv.status,
    activeRunId: conv.activeRunId,
    sessionId: conv.sessionId,
    turns: db.listConversationTurns(conv.id),
    queue: db.listQueue(conv.id),
  };
}

// Node's global crypto (>=19) — avoids importing node:crypto just for an id.
function cryptoRandomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `q_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
