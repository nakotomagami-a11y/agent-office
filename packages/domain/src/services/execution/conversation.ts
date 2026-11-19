/**
 * Conversation service — binds the pure {@link reduce} state machine to the DB and to the
 * conversation's live CLI process. The one server-side driver of chat turns and the agent queue.
 *
 * Flow: load the state from the DB → `reduce(state, action)` → persist → perform a `deliver`
 * effect through the injected {@link ConversationRunner}. The process reports back: a turn opened
 * (`onSessionEvent`), a turn ended (`onRunFinished`, from the run engine), it went idle or exited.
 * Calls for one conversation are serialized, so two reports never interleave a read-modify-write.
 *
 * The runner is injected so this layer is unit-testable without spawning `claude`
 * (conversation.test.ts); the production one is execution/chat-session.ts.
 *
 * See docs/chat-refactor.md.
 */
import * as db from "../db";
import { log } from "../infra/log";
import { emitAppEvent } from "../infra/events";
import { reduce, type ConversationAction, type ConversationState, type QueuedMessage } from "./conversation-machine";
import type { DeliverOptions, DeliverResult, SessionConversation, SessionInput } from "./chat-session";
import type { SessionEvent } from "./chat-session-registry";
import type { ContextProfile, ConversationView, MessageOrigin } from "../../types/index";
export type { ConversationView } from "../../types/index";

/** What carries a conversation's messages to its agent. */
export interface ConversationRunner {
  deliver(conv: SessionConversation, input: SessionInput, opts: DeliverOptions): Promise<DeliverResult>;
  /** Send what an earlier process never read. */
  redeliver(conv: SessionConversation): Promise<DeliverResult>;
  /** A turn open, a message unread, or background work running. */
  isBusy(convId: string): boolean;
  hasLiveProcess(convId: string): boolean;
  close(convId: string): Promise<void>;
}

/** A send the agent could not get: the HTTP layer turns `code` into a status. */
export class DeliveryError extends Error {
  override readonly name = "DeliveryError";
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
  }
}

/** A start window (`running`, no process, no turn) lasts seconds; one this old means the server
 *  died mid-start. Settled rather than left blocking the agent queue. */
export const STALLED_START_MS = 2 * 60_000;

const chains = new Map<string, Promise<unknown>>();
function serialized<T>(convId: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(convId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const tail = next.then(() => undefined, () => undefined);
  chains.set(convId, tail);
  void tail.then(() => { if (chains.get(convId) === tail) chains.delete(convId); });
  return next;
}

function buildState(conv: db.ConversationRow): ConversationState {
  const latest = db.latestConversationTurn(conv.id);
  return {
    status: conv.status,
    activeRunId: conv.activeRunId,
    sessionId: conv.sessionId,
    lastPrompt: latest?.prompt ?? null,
    lastOrigin: latest?.origin ?? "user",
    lastFailed: latest?.status === "error",
    queue: db.listQueue(conv.id).map((m) => ({ id: m.id, text: m.text, origin: m.origin })),
  };
}

function persist(convId: string, next: ConversationState): void {
  db.updateConversation(convId, { status: next.status, activeRunId: next.activeRunId, sessionId: next.sessionId });
  db.replaceQueue(convId, next.queue.map((m) => ({ id: m.id, text: m.text, origin: m.origin })));
}

const sessionConversation = (conv: db.ConversationRow): SessionConversation => ({
  id: conv.id, agentId: conv.agentId, instanceId: conv.instanceId, projectId: conv.projectId, sessionId: conv.sessionId,
});

interface ApplyOptions extends DeliverOptions {
  /** A delivery nothing reached: `park` the chat for the user (the agent queue's own drain, so a
   *  broken spawn is not retried on every idle), `restore` it as it was, or `throw` for the caller
   *  (a user's send) after restoring. */
  onFailure?: "park" | "restore" | "throw";
}

/** Reduce, persist, deliver. Must run inside `serialized`. */
async function step(convId: string, action: ConversationAction, runner: ConversationRunner, opts: ApplyOptions = {}): Promise<DeliverResult | null> {
  const conv = db.getConversation(convId);
  if (!conv) throw new Error(`conversation not found: ${convId}`);
  const prev = buildState(conv);
  const { state: next, effects } = reduce(prev, action);
  persist(convId, next);
  emitAppEvent("conversations:changed");
  const effect = effects[0];
  if (!effect) return null;

  // A thread "New thread" left behind is shown nowhere: a process for it would be a second agent on the seat.
  const result: DeliverResult = isCurrent(conv)
    ? await runner.deliver(sessionConversation(conv), effect.message, { contextProfile: opts.contextProfile, maxBudgetUsd: opts.maxBudgetUsd })
    : { ok: false, error: { status: 409, code: "conversation_not_current", message: "This thread was replaced by a newer one." } };
  if (result.ok) return result;
  if ("refusedRunId" in result) {
    const refused = db.getRun(result.refusedRunId);
    await step(convId, { type: "turnOpened", runId: result.refusedRunId, prompt: refused?.prompt ?? effect.message.text, origin: refused?.origin ?? effect.message.origin }, runner);
    turnWaiters.get(effect.message.id)?.(result.refusedRunId);
    return result;
  }
  // Nothing reached the agent. A queued message goes back to the head; the chat settles as it was.
  log.warn("conversation.deliver_failed", { convId, code: result.error.code, message: result.error.message });
  const now = buildState(db.getConversation(convId)!);
  const onFailure = opts.onFailure ?? "park";
  // A parked system message waits at the head: nothing else holds its text.
  const keep = onFailure === "park" && effect.message.origin === "system" && !now.queue.some((m) => m.id === effect.message.id);
  const queue = keep ? [effect.message, ...now.queue] : now.queue;
  const restored = prev.status === "running" ? (prev.lastFailed ? "needs_attention" : "idle") : prev.status;
  const status = runner.isBusy(convId) ? "running" : onFailure === "park" ? "needs_attention" : restored;
  persist(convId, { ...now, status, queue, lastFailed: prev.lastFailed });
  emitAppEvent("conversations:changed");
  if (onFailure === "throw") throw new DeliveryError(result.error.code ?? "start_failed", result.error.status, result.error.message);
  return result;
}

/** The process has nothing to do: settle the status, drain the agent queue, or send what it never read. */
async function settle(convId: string, runner: ConversationRunner): Promise<void> {
  if (runner.isBusy(convId)) return;
  await step(convId, { type: "idle" }, runner);
  const conv = db.getConversation(convId);
  if (!conv || !isCurrent(conv) || runner.hasLiveProcess(convId)) return;
  // Unread messages and no process (it died, the server restarted): they go to a new one. A failed
  // turn holds back Agent Office's own, never the user's.
  const pending = db.listPendingInputs(convId);
  const sendable = conv.status === "idle" ? pending : conv.status === "needs_attention" ? pending.filter((p) => p.origin === "user") : [];
  if (sendable.length === 0) return;
  persist(convId, { ...buildState(conv), status: "running" });
  const result = await runner.redeliver(sessionConversation(conv));
  if (!result.ok) {
    log.warn("conversation.redeliver_failed", { convId });
    persist(convId, { ...buildState(db.getConversation(convId)!), status: "needs_attention" });
  }
  emitAppEvent("conversations:changed");
}

/**
 * Bring the conversation in line with the runs table and the process: an active turn that already
 * ended without reporting (a restart reaped it), or a `running` chat with nothing behind it. Called
 * before every action and read, so nobody acts on a conversation stuck on a ghost.
 */
async function reconcile(convId: string, runner: ConversationRunner): Promise<void> {
  const conv = db.getConversation(convId);
  if (!conv || conv.status !== "running") return;
  if (conv.activeRunId) {
    const run = db.getRun(conv.activeRunId);
    if (!run || run.status === "running") return;
    await step(convId, { type: "turnEnded", runId: run.id, ok: run.status === "done", sessionId: run.sessionId ?? null }, runner);
    return settle(convId, runner);
  }
  if (runner.hasLiveProcess(convId) || Date.now() - conv.updatedAt < STALLED_START_MS) return;
  await settle(convId, runner);
}

function apply(convId: string, action: ConversationAction, runner: ConversationRunner, opts: ApplyOptions = {}): Promise<ConversationView> {
  return serialized(convId, async () => {
    await reconcile(convId, runner);
    await step(convId, action, runner, opts);
    return view(convId);
  });
}

function isCurrent(conv: db.ConversationRow): boolean {
  return db.getActiveConversation(conv.agentId, conv.instanceId)?.id === conv.id;
}

/** Ensure a conversation exists for the slot, returning its (reconciled) view. */
export function ensureConversationView(
  agentId: string,
  instanceId: string,
  projectId: string | null,
  runner: ConversationRunner,
): Promise<ConversationView> {
  const conv = db.ensureConversation(agentId, instanceId, projectId);
  return getReconciledView(conv.id, runner);
}

/** Send a message: the user's goes to the agent now, Agent Office's waits for idle. */
export function sendMessage(
  agentId: string,
  instanceId: string,
  projectId: string | null,
  text: string,
  runner: ConversationRunner,
  contextProfile?: ContextProfile,
  origin: MessageOrigin = "user",
): Promise<ConversationView> {
  const conv = db.ensureConversation(agentId, instanceId, projectId);
  return sendMessageToConversation(conv.id, text, runner, contextProfile, origin);
}

/** Throws {@link DeliveryError} when a user's message could not reach the agent (no spawn possible). */
export function sendMessageToConversation(
  convId: string,
  text: string,
  runner: ConversationRunner,
  contextProfile?: ContextProfile,
  origin: MessageOrigin = "user",
): Promise<ConversationView> {
  const message: QueuedMessage = { id: randomId(), text, origin };
  return apply(convId, { type: "send", message }, runner, { contextProfile, onFailure: origin === "user" ? "throw" : "park" });
}

/**
 * The user's message, and the run that read it: the turn it opened, or the one running when the
 * agent took it mid-turn. Null when no turn read it in time. For callers that follow a run's stream
 * (`POST /api/summon`); the chat itself follows the conversation.
 */
export async function sendMessageForRun(
  convId: string,
  text: string,
  runner: ConversationRunner,
  contextProfile?: ContextProfile,
): Promise<{ runId: string | null }> {
  const message: QueuedMessage = { id: randomId(), text, origin: "user" };
  const read = waitForTurn(message.id, SUMMON_WAIT_MS);
  try {
    await apply(convId, { type: "send", message }, runner, { contextProfile, onFailure: "throw" });
  } catch (err) {
    read.cancel();
    throw err;
  }
  // Mid-command the agent may not read it for minutes: answer with the turn running now instead.
  return { runId: (await read.promise) ?? db.getConversation(convId)?.activeRunId ?? null };
}

/** Long enough for a fresh process to start and read its first message. */
const SUMMON_WAIT_MS = 15_000;

/**
 * Start `text` as the next turn ONLY if the chat is idle with an empty queue, and say which run it
 * became: a loop's fix round and a scheduled message must know their run, or wait (principle 6 in
 * docs/chat-refactor.md). Never queued; a failed start leaves the chat as it was.
 */
export async function startTurnIfIdle(
  convId: string,
  text: string,
  origin: MessageOrigin,
  runner: ConversationRunner,
  maxBudgetUsd?: number,
  /** A scheduled resume is the answer to a failed turn: it may start in `needs_attention`, as the user's Resume does. */
  allowParked = false,
): Promise<{ runId: string } | { code: string }> {
  const message: QueuedMessage = { id: randomId(), text, origin };
  const opened = waitForTurn(message.id);
  // The turn opens on the process's report, which queues behind this call: wait outside the chain.
  const started = await serialized(convId, async (): Promise<{ runId: string } | { code: string } | null> => {
    await reconcile(convId, runner);
    if (!runner.isBusy(convId)) await step(convId, { type: "idle" }, runner);
    const conv = db.getConversation(convId);
    if (!conv) return { code: "conversation_not_found" };
    const state = buildState(conv);
    const startable = state.status === "idle" || (allowParked && state.status === "needs_attention" && origin === "user");
    if (!startable || state.queue.length > 0 || runner.isBusy(convId)) return { code: "already_running" };
    const result = await step(convId, { type: "send", message }, runner, { maxBudgetUsd, onFailure: "restore" });
    if (result?.ok) return null;
    if (result && "refusedRunId" in result) return { runId: result.refusedRunId };
    return { code: result && "error" in result ? result.error.code ?? "start_failed" : "start_failed" };
  }).catch((err: unknown) => {
    opened.cancel();
    throw err;
  });
  if (started) {
    opened.cancel();
    return started;
  }
  const runId = await opened.promise;
  return runId ? { runId } : { code: "start_failed" };
}

const TURN_OPEN_TIMEOUT_MS = 2 * 60_000;
const turnWaiters = new Map<string, (runId: string | null) => void>();

function waitForTurn(inputId: string, timeoutMs = TURN_OPEN_TIMEOUT_MS): { promise: Promise<string | null>; cancel: () => void } {
  let finish!: (runId: string | null) => void;
  const promise = new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => finish(null), timeoutMs);
    timer.unref();
    finish = (runId) => {
      clearTimeout(timer);
      turnWaiters.delete(inputId);
      resolve(runId);
    };
    turnWaiters.set(inputId, finish);
  });
  return { promise, cancel: () => finish(null) };
}

/** A turn of the conversation ended (from the run engine's finish listeners). Sub-agent runs and
 *  runs of no conversation are ignored. */
export async function onRunFinished(runId: string, ok: boolean, sessionId: string | null, runner: ConversationRunner): Promise<void> {
  const convId = db.getRun(runId)?.conversationId;
  if (!convId || !db.getConversation(convId)) return;
  await serialized(convId, async () => {
    await step(convId, { type: "turnEnded", runId, ok, sessionId }, runner);
    await settle(convId, runner);
  });
}

/** What the conversation's process reported. */
export async function onSessionEvent(event: SessionEvent, runner: ConversationRunner): Promise<void> {
  if (!db.getConversation(event.convId)) return;
  if (event.type === "inputRead") turnWaiters.get(event.inputId)?.(event.runId);
  if (event.type === "changed" || event.type === "inputRead") {
    emitAppEvent("conversations:changed");
    return;
  }
  await serialized(event.convId, async () => {
    if (event.type === "turnOpened") {
      await step(event.convId, { type: "turnOpened", runId: event.runId, prompt: event.prompt, origin: event.origin }, runner);
      if (event.inputId) turnWaiters.get(event.inputId)?.(event.runId);
      return;
    }
    if (event.type === "exited") {
      // What it held will never open a turn there; a successor may already hold the rest.
      for (const id of event.unreadIds) turnWaiters.get(id)?.(null);
    }
    if (event.type === "exited" && event.sessionId) db.updateConversation(event.convId, { sessionId: event.sessionId });
    await settle(event.convId, runner);
  });
}

export function retry(convId: string, runner: ConversationRunner): Promise<ConversationView> {
  return apply(convId, { type: "retry" }, runner, { onFailure: "throw" });
}

export function resume(convId: string, runner: ConversationRunner): Promise<ConversationView> {
  return apply(convId, { type: "resume" }, runner, { onFailure: "throw" });
}

export function removeQueued(convId: string, messageId: string): ConversationView {
  db.removeQueuedMessage(convId, messageId);
  emitAppEvent("conversations:changed");
  return view(convId);
}

export function clearQueue(convId: string): ConversationView {
  db.clearQueue(convId);
  emitAppEvent("conversations:changed");
  return view(convId);
}

/** Start a fresh conversation ("New thread") for the slot. The old one's process is stopped; its
 *  turns, queue and unread messages stay with it. */
export async function newThread(agentId: string, instanceId: string, projectId: string | null, runner: ConversationRunner): Promise<ConversationView> {
  const old = db.getActiveConversation(agentId, instanceId);
  if (old) await runner.close(old.id);
  const conv = db.startNewConversation(agentId, instanceId, projectId);
  emitAppEvent("conversations:changed");
  return view(conv.id);
}

/** "New thread" from a known conversation id — the shape the `/api/conversations/:id/new` route uses. */
export function newThreadFromConversation(oldConvId: string, runner: ConversationRunner): Promise<ConversationView> {
  const old = db.getConversation(oldConvId);
  if (!old) throw new Error(`conversation not found: ${oldConvId}`);
  return newThread(old.agentId, old.instanceId, old.projectId, runner);
}

/** Read-path variant of `view()` that reconciles first, so no client sees a conversation stuck on a dead turn. */
export function getReconciledView(convId: string, runner: ConversationRunner): Promise<ConversationView> {
  return serialized(convId, async () => {
    await reconcile(convId, runner);
    return view(convId);
  });
}

/** The full view: conversation row, turns, unread messages, agent queue. */
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
    pending: db.listPendingInputs(conv.id),
    queue: db.listQueue(conv.id),
  };
}

function randomId(): string {
  return globalThis.crypto.randomUUID();
}
