/**
 * A conversation's long-lived `claude` process. Its stdin stays open (`--input-format stream-json`),
 * so a message sent while the agent works reaches it at its next step instead of waiting for the
 * turn to end: the CLI adds it to the next tool result, or runs it as the next turn when the agent
 * was already writing its answer. The CLI also starts a turn on its own when a background sub-agent
 * finishes, which only happens while stdin is open.
 *
 * One turn is one `runs` row, opened when the CLI reads a message (its `--replay-user-messages`
 * echo, matched by the uuid we sent) or starts answering on its own, and ended by its `result`.
 * The process outlives its turns: it owns the provider spawn and is closed once it has nothing
 * open, unread or running in the background for IDLE_CLOSE_MS, or when the seat's settings change.
 * A message it never read stays in `run_inputs` and is sent again by the next process.
 *
 * See docs/chat-refactor.md.
 */
import { randomUUID } from "node:crypto";
import type { ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import type { ContextProfile, ConversationInput, MessageOrigin, SummonRequest } from "../../types/index";
import * as db from "../db";
import { log } from "../infra/log";
import { appBaseUrl } from "../infra/discovery";
import { spawnClaude } from "../infra/claude-bin";
import { currentProvider } from "../providers/current";
import * as store from "../infra/store";
import * as runs from "./runs";
import type { LiveRun } from "./runs/types";
import { prepareProviderSpawn, releaseProviderSpawn, runCost, type ProviderSpawn } from "./runs/provider-spawn";
import { chargeOutstandingHolds } from "../providers/gateway-tokens";
import { prepareSummon, type PreparedSummon, type SummonError } from "./summon-run";
import { chatSessions, seatKey, type SessionListener } from "./chat-session-registry";

export const IDLE_CLOSE_MS = 15 * 60_000;
/** Stop asks the turn to end; a process that does not answer within this is killed. */
export const INTERRUPT_GRACE_MS = 5_000;
const CLOSE_GRACE_MS = 10_000;
/** How long a finished background task may take to get its report turn before the process counts as idle. */
const REPORT_GRACE_MS = 3_000;
/** No process outlives this, however busy: its provider token and pin live exactly as long as it. */
export const MAX_LIFETIME_MS = 4 * 60 * 60_000;
/** Nothing open or unread: the process closes after this even while background work still runs. */
const BACKGROUND_IDLE_MS = 60 * 60_000;
/** Turns the CLI may start on its own in a row, with no message in between, before it is stopped. */
const MAX_SELF_TURNS = 3;
const STDERR_KEPT = 16 * 1024;
const KEPT_TURNS = 20;
const MISSING_SESSION = "No conversation found with session ID";
// Fixed text: the CLI's own summary is written by the model, and a turn's prompt reaches prior context.
const REPORT_TURN_PROMPT = "A background task finished.";
const SELF_TURN_PROMPT = "The agent continued on its own.";

type Proc = ChildProcessByStdio<Writable, Readable, Readable>;

export interface SessionConversation {
  id: string;
  agentId: string;
  instanceId: string;
  projectId: string | null;
  sessionId: string | null;
}

export interface SessionInput {
  id: string;
  text: string;
  origin: MessageOrigin;
}

export interface DeliverOptions {
  contextProfile?: ContextProfile;
  /** A capped turn gets a process of its own: the CLI's cap counts everything its process spent. */
  maxBudgetUsd?: number;
}

export type DeliverResult = { ok: true } | { ok: false; error: SummonError } | { ok: false; refusedRunId: string };

interface ChatSession {
  conv: SessionConversation;
  ownerId: string;
  proc: Proc;
  spawn: ProviderSpawn;
  prepared: PreparedSummon;
  specKey: string;
  capped: boolean;
  resumed: boolean;
  sessionId?: string;
  initSessionId?: string;
  freshSession: boolean;
  turn?: LiveRun;
  turns: LiveRun[];
  /** Written to stdin, not yet read by the CLI, in send order. */
  unread: Map<string, SessionInput>;
  /** The first message's text as the CLI got it: prior context included. */
  firstContent?: { id: string; content: string };
  backgroundTasks: number;
  /** Set while the CLI is expected to start a turn reporting a finished background task. */
  reportTimer?: NodeJS.Timeout;
  cliCost: number;
  /** The process's stderr tail, and the open turn's own: an error card shows only its turn's. */
  stderrBuf: string;
  turnStderr: string;
  /** A background task reported since the last turn: the next turn the CLI starts is its report. */
  taskReported: boolean;
  turnsOpened: number;
  /** Turns the CLI started on its own since the last message. */
  selfTurns: number;
  /** Past MAX_LIFETIME_MS: closes once the open turn ends. */
  retiring: boolean;
  lifetimeTimer?: NodeJS.Timeout;
  closing: boolean;
  exited: Promise<void>;
  idleTimer?: NodeJS.Timeout;
  interruptTimer?: NodeJS.Timeout;
}

const sessions = chatSessions.map as Map<string, ChatSession>;

const keepTail = (text: string): string => (text.length > STDERR_KEPT ? text.slice(-STDERR_KEPT) : text);

/** Calls for one conversation run one at a time: a spawn in progress must not race a second one. */
const chains = new Map<string, Promise<unknown>>();
function serialized<T>(convId: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(convId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const tail = next.then(() => undefined, () => undefined);
  chains.set(convId, tail);
  void tail.then(() => { if (chains.get(convId) === tail) chains.delete(convId); });
  return next;
}

export function onSessionEvent(listener: SessionListener): () => void {
  chatSessions.listeners.add(listener);
  return () => chatSessions.listeners.delete(listener);
}

function emit(event: Parameters<SessionListener>[0]): void {
  for (const listener of chatSessions.listeners) {
    try {
      listener(event);
    } catch (err) {
      log.warn("chat_session.listener_failed", { convId: event.convId, err: String(err) });
    }
  }
}

function isBusySession(s: ChatSession): boolean {
  return !!s.turn || s.unread.size > 0 || s.backgroundTasks > 0 || !!s.reportTimer;
}

/** Something is open, unread, or running in the background: the conversation is not idle. */
export function isBusy(convId: string): boolean {
  const s = sessions.get(convId);
  return !!s && !s.closing && isBusySession(s);
}

export function openTurnId(convId: string): string | null {
  return sessions.get(convId)?.turn?.id ?? null;
}

export function hasLiveProcess(convId: string): boolean {
  const s = sessions.get(convId);
  return !!s && !s.closing;
}

/**
 * Send a message to the conversation's process, starting one if there is none. The row is written
 * first, so a message is never lost to a spawn that fails or a process that dies before reading it.
 */
export function deliver(conv: SessionConversation, input: SessionInput, opts: DeliverOptions = {}): Promise<DeliverResult> {
  db.insertRunInput({ id: input.id, conversationId: conv.id, text: input.text, origin: input.origin, sentAt: Date.now() });
  return serialized(conv.id, async (): Promise<DeliverResult> => {
    let result: DeliverResult;
    try {
      const live = sessions.get(conv.id);
      if (live && !live.closing && isBusySession(live) && opts.maxBudgetUsd === undefined) {
        write(live, input);
        result = { ok: true };
      } else {
        result = await startOrReuse(conv, opts);
      }
    } catch (err) {
      // A message the caller is told failed must not be sent later behind its back.
      log.error("chat_session.deliver_failed", { convId: conv.id, err: String(err) });
      result = { ok: false, error: { status: 500, code: "start_failed", message: String(err) } };
    }
    if (!result.ok && !("refusedRunId" in result)) db.deleteRunInput(conv.id, input.id);
    if (result.ok && input.origin === "user") store.pushRecentPrompt(conv.agentId, input.text);
    return result;
  });
}

/** Re-send what an earlier process never read (it crashed, or the server restarted). */
export function redeliverPending(conv: SessionConversation): Promise<DeliverResult> {
  return serialized(conv.id, () => startOrReuse(conv, {}));
}

async function startOrReuse(conv: SessionConversation, opts: DeliverOptions): Promise<DeliverResult> {
  const pending = db.listPendingInputs(conv.id);
  const head = pending[0];
  if (!head) return { ok: true };
  const live = sessions.get(conv.id);
  if (live && !live.closing && isBusySession(live) && opts.maxBudgetUsd === undefined) return writeUnsent(live, pending);
  // Two processes must never hold one session: a closing one finishes first.
  if (live?.closing) await live.exited;

  const request = summonRequestFor(conv, head, db.getConversation(conv.id)?.sessionId ?? conv.sessionId, opts);
  const preparation = await prepareSummon(request, { streamInput: true });
  if ("error" in preparation) return { ok: false, error: preparation.error };
  const specKey = specKeyOf(preparation.prepared);
  const capped = opts.maxBudgetUsd !== undefined;

  if (live && !live.closing && live.specKey === specKey && !live.capped && !capped) return writeUnsent(live, pending);
  // Closed now, or by its idle timer while the spawn was prepared: either way, gone before the next starts.
  if (live) await close(live);
  return spawnSession({ conv, prepared: preparation.prepared, specKey, capped, pending });
}

function writeUnsent(live: ChatSession, pending: ConversationInput[]): DeliverResult {
  for (const input of pending) if (!live.unread.has(input.id)) write(live, input);
  return { ok: true };
}

/** The spawn request for a conversation's process. "default" is the DB's sentinel for the
 *  instance-less seat; the summon path expects it absent. */
export function summonRequestFor(
  conv: SessionConversation,
  head: SessionInput,
  resumeSessionId: string | null,
  opts: DeliverOptions,
): SummonRequest {
  return {
    agentId: conv.agentId,
    prompt: head.text,
    origin: head.origin,
    instanceId: conv.instanceId === "default" ? undefined : conv.instanceId,
    projectId: conv.projectId ?? undefined,
    resumeSessionId: resumeSessionId ?? undefined,
    conversationId: conv.id,
    contextProfile: opts.contextProfile,
    maxBudgetUsd: opts.maxBudgetUsd,
  };
}

/** What makes two spawns the same process: everything but the session to resume, the prompt file
 *  (a fresh temp path each time, its text differing only by the prior-context note) and the cap value. */
function specKeyOf(prepared: PreparedSummon): string {
  const args: string[] = [];
  const skip = new Set(["--resume", "--append-system-prompt-file", "--max-budget-usd"]);
  for (let i = 0; i < prepared.built.args.length; i++) {
    const arg = prepared.built.args[i]!;
    if (skip.has(arg)) { i++; continue; }
    args.push(arg);
  }
  return JSON.stringify({ args, cwd: prepared.cwd ?? null, provider: currentProvider().provider, identity: prepared.identity });
}

interface SpawnPlan {
  conv: SessionConversation;
  prepared: PreparedSummon;
  specKey: string;
  capped: boolean;
  /** Every unread message, oldest first: the first carries the prior context. */
  pending: ConversationInput[];
  freshSession?: boolean;
}

function spawnSession({ conv, prepared, specKey, capped, pending, freshSession = false }: SpawnPlan): DeliverResult {
  const ownerId = `chat_${randomUUID()}`;
  const head = pending[0]!;
  const runOpts = {
    agentId: conv.agentId, agentName: prepared.agentName, prompt: head.text, origin: head.origin,
    model: prepared.built.model, effort: prepared.built.effort, cwd: prepared.cwd, projectId: conv.projectId ?? undefined,
    instanceId: prepared.instanceId, instanceLabel: prepared.instanceLabel, conversationId: conv.id, args: prepared.built.args,
  };
  const spawn = prepareProviderSpawn(ownerId, runOpts);
  if (!spawn.ok) {
    // The head becomes the refused turn; the rest stay unread for the next attempt.
    db.deleteRunInput(conv.id, head.id);
    return { ok: false, refusedRunId: runs.recordRefusedRun(runOpts, spawn) };
  }
  spawn.env.AO_RUN_ID = ownerId;
  spawn.env.AO_BASE_URL = appBaseUrl();
  let proc: Proc;
  try {
    proc = spawnClaude(spawn.args, { stdio: ["pipe", "pipe", "pipe"], cwd: prepared.cwd, env: spawn.env }) as Proc;
  } catch (err) {
    releaseProviderSpawn(ownerId, spawn.pinFile);
    throw err;
  }
  let markExited!: () => void;
  const session: ChatSession = {
    conv: { ...conv, sessionId: db.getConversation(conv.id)?.sessionId ?? conv.sessionId },
    ownerId, proc, spawn, prepared, specKey, capped,
    resumed: spawn.args.includes("--resume"),
    sessionId: undefined,
    freshSession,
    turns: [],
    unread: new Map(),
    backgroundTasks: 0,
    cliCost: 0,
    stderrBuf: "",
    turnStderr: "",
    taskReported: false,
    selfTurns: 0,
    retiring: false,
    turnsOpened: 0,
    closing: false,
    exited: new Promise<void>((resolve) => { markExited = resolve; }),
  };
  if (session.resumed) session.sessionId = session.conv.sessionId ?? undefined;
  sessions.set(conv.id, session);
  log.info("chat_session.start", { convId: conv.id, ownerId, resumed: session.resumed, provider: spawn.provider });
  session.lifetimeTimer = setTimeout(() => retire(session), MAX_LIFETIME_MS);
  session.lifetimeTimer.unref();
  attach(session, markExited);
  session.firstContent = { id: head.id, content: prepared.built.stdin };
  for (const input of pending) write(session, input);
  return { ok: true };
}

function attach(session: ChatSession, markExited: () => void): void {
  const { proc } = session;
  proc.stdin.on("error", () => {});
  pumpStdout(session);
  proc.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    session.stderrBuf = keepTail(session.stderrBuf + text);
    session.turnStderr = keepTail(session.turnStderr + text);
  });
  proc.on("error", (err) => log.warn("chat_session.spawn_error", { convId: session.conv.id, err: String(err) }));
  proc.on("close", (code, signal) => {
    markExited();
    onExit(session, code ?? 1, signal);
  });
}

function write(session: ChatSession, input: SessionInput): void {
  const content = session.firstContent?.id === input.id ? session.firstContent.content : input.text;
  session.unread.set(input.id, input);
  clearIdle(session);
  session.proc.stdin.write(JSON.stringify({
    type: "user", uuid: input.id, session_id: "", parent_tool_use_id: null, message: { role: "user", content },
  }) + "\n");
}

function pumpStdout(session: ChatSession): void {
  let buf = "";
  session.proc.stdout.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) handleLine(session, line);
    }
  });
  session.proc.stdout.on("end", () => {
    if (buf.trim()) handleLine(session, buf.trim());
  });
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

function parse(line: string): Json | null {
  try {
    const value: unknown = JSON.parse(line);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function handleLine(session: ChatSession, line: string): void {
  const evt = parse(line);
  if (!evt) {
    if (session.turn) runs.feedTurn(session.turn, line);
    return;
  }
  const type = str(evt.type);
  const subtype = str(evt.subtype);

  if (type === "user" && evt.isReplay === true) return onReplay(session, str(evt.uuid));
  if (type === "command_lifecycle" || type === "control_response") return;

  if (type === "system" && subtype === "init") {
    session.initSessionId = str(evt.session_id) ?? session.initSessionId;
    if (session.turn) runs.feedTurn(session.turn, line);
    return;
  }
  if (type === "system" && subtype === "background_tasks_changed") {
    const before = session.backgroundTasks;
    session.backgroundTasks = Array.isArray(evt.tasks) ? evt.tasks.length : 0;
    // The last task ended: the CLI is about to start a turn to report it. Not idle in between.
    if (before > 0 && session.backgroundTasks === 0 && !session.turn) awaitReport(session);
    return settle(session);
  }
  if (type === "system" && subtype?.startsWith("task_")) {
    if (subtype === "task_notification") session.taskReported = true;
    const owner = ownerTurn(session, str(evt.tool_use_id)) ?? session.turn;
    if (owner) runs.feedTurn(owner, line);
    return;
  }

  const parentToolUseId = str(evt.parent_tool_use_id);
  if (parentToolUseId) {
    const owner = ownerTurn(session, parentToolUseId) ?? session.turn;
    if (owner?.status === "running") runs.feedTurn(owner, line);
    return;
  }

  if (type === "result") return onResult(session, evt, line);
  if (!session.turn && (type === "assistant" || type === "stream_event")) {
    if (session.closing) return;
    // A chain of turns nobody asked for is the agent driving itself, unwatched: stop it.
    if (session.selfTurns >= MAX_SELF_TURNS) {
      log.warn("chat_session.self_turn_cap", { convId: session.conv.id, selfTurns: session.selfTurns });
      void close(session, true);
      return;
    }
    openTurn(session, { id: null, text: session.taskReported ? REPORT_TURN_PROMPT : SELF_TURN_PROMPT, origin: "system" });
  }
  if (session.turn) runs.feedTurn(session.turn, line);
}

/** The turn whose sub-agent this is: a background sub-agent reports after its turn has ended. */
function ownerTurn(session: ChatSession, toolUseId: string | undefined): LiveRun | undefined {
  if (!toolUseId) return undefined;
  for (let i = session.turns.length - 1; i >= 0; i--) {
    if (session.turns[i]!.subAgents.has(toolUseId)) return session.turns[i];
  }
  return undefined;
}

function onReplay(session: ChatSession, uuid: string | undefined): void {
  const input = uuid ? session.unread.get(uuid) : undefined;
  if (!input) return;
  session.unread.delete(input.id);
  const now = Date.now();
  if (!session.turn) {
    openTurn(session, input);
    return;
  }
  db.markRunInputRead(input.id, session.turn.id, now, false);
  runs.noteTurnInput(session.turn, { id: input.id, text: input.text, origin: input.origin, ts: now });
  emit({ type: "inputRead", convId: session.conv.id, runId: session.turn.id, inputId: input.id });
}

function openTurn(session: ChatSession, input: { id: string | null; text: string; origin: MessageOrigin }): void {
  const { conv, prepared, spawn } = session;
  const turn = runs.openHostedTurn({
    host: {
      ownerId: session.ownerId,
      interrupt: () => interrupt(session),
      kill: () => runs.killRunProc(session.proc),
    },
    proc: session.proc,
    agentId: conv.agentId,
    agentName: prepared.agentName,
    prompt: input.text,
    origin: input.origin,
    model: prepared.built.model,
    effort: prepared.built.effort,
    cwd: prepared.cwd,
    projectId: conv.projectId ?? undefined,
    instanceId: prepared.instanceId,
    instanceLabel: prepared.instanceLabel,
    conversationId: conv.id,
    args: spawn.args,
    secretValues: spawn.secretValues,
    provider: spawn.provider,
    costBasis: spawn.costBasis,
    accountId: spawn.accountId,
    // In the turn's own terms: the CLI's figure, or the gateway's meter where it prices the calls.
    costBase: runCost(session.ownerId, spawn.provider, session.cliCost).cost,
    sessionId: session.sessionId,
    pendingSessionId: session.initSessionId,
    freshSession: session.freshSession && session.turnsOpened === 0,
  });
  if (input.id) db.markRunInputRead(input.id, turn.id, Date.now(), true);
  session.turn = turn;
  session.turnsOpened++;
  session.selfTurns = input.id ? 0 : session.selfTurns + 1;
  session.taskReported = false;
  session.turnStderr = "";
  clearTimeout(session.reportTimer);
  session.reportTimer = undefined;
  session.turns.push(turn);
  if (session.turns.length > KEPT_TURNS) session.turns.shift();
  clearIdle(session);
  emit({ type: "turnOpened", convId: conv.id, runId: turn.id, prompt: input.text, origin: input.origin, inputId: input.id });
}

/** A `result` with no turn open is the CLI failing before it read anything (a dead `--resume`
 *  echoes the session it could not find): it names no session worth keeping. */
function onResult(session: ChatSession, evt: Json, line: string): void {
  const turn = session.turn;
  if (!turn) return;
  if (typeof evt.total_cost_usd === "number") session.cliCost = evt.total_cost_usd;
  const sessionId = str(evt.session_id);
  if (sessionId) session.sessionId = sessionId;
  runs.feedTurn(turn, line);
  clearTimeout(session.interruptTimer);
  session.turn = undefined;
  runs.endTurn(turn, evt.is_error === true ? 1 : 0);
  if (session.retiring) return void close(session);
  settle(session);
}

/** Nothing open, unread or in the background: tell the conversation, and close the process once it has idled long enough. */
function settle(session: ChatSession): void {
  if (session.closing) return;
  if (isBusySession(session)) {
    clearIdle(session);
    // Only background work left: it may run long, but not forever with the spawn held open.
    if (!session.turn && session.unread.size === 0 && !session.reportTimer) armIdle(session, BACKGROUND_IDLE_MS);
    emit({ type: "changed", convId: session.conv.id });
    return;
  }
  clearIdle(session);
  armIdle(session, IDLE_CLOSE_MS);
  emit({ type: "idle", convId: session.conv.id });
}

function armIdle(session: ChatSession, ms: number): void {
  session.idleTimer = setTimeout(() => void close(session), ms);
  session.idleTimer.unref();
}

/** Past its lifetime: closes now, or once the open turn ends. */
function retire(session: ChatSession): void {
  log.info("chat_session.lifetime_reached", { convId: session.conv.id });
  if (session.turn) session.retiring = true;
  else void close(session);
}

function awaitReport(session: ChatSession): void {
  clearTimeout(session.reportTimer);
  session.reportTimer = setTimeout(() => {
    session.reportTimer = undefined;
    settle(session);
  }, REPORT_GRACE_MS);
  session.reportTimer.unref();
}

function clearIdle(session: ChatSession): void {
  if (session.idleTimer) clearTimeout(session.idleTimer);
  session.idleTimer = undefined;
}

function interrupt(session: ChatSession): void {
  const turn = session.turn;
  if (!turn) return;
  session.proc.stdin.write(JSON.stringify({ type: "control_request", request_id: randomUUID(), request: { subtype: "interrupt" } }) + "\n");
  clearTimeout(session.interruptTimer);
  session.interruptTimer = setTimeout(() => {
    if (session.turn !== turn) return;
    log.warn("chat_session.interrupt_unanswered", { convId: session.conv.id, runId: turn.id });
    runs.killRunProc(session.proc);
  }, INTERRUPT_GRACE_MS);
  session.interruptTimer.unref();
}

/** Close the process: stdin ends and the CLI exits once its turn is done; kill it if it lingers. */
async function close(session: ChatSession, kill = false): Promise<void> {
  if (!session.closing) {
    session.closing = true;
    clearIdle(session);
    if (kill) runs.killRunProc(session.proc);
    else session.proc.stdin.end();
  }
  const timer = setTimeout(() => runs.killRunProc(session.proc), CLOSE_GRACE_MS);
  timer.unref();
  await session.exited;
  clearTimeout(timer);
}

function onExit(session: ChatSession, code: number, signal: NodeJS.Signals | null): void {
  const { conv } = session;
  clearIdle(session);
  clearTimeout(session.interruptTimer);
  clearTimeout(session.reportTimer);
  clearTimeout(session.lifetimeTimer);
  session.reportTimer = undefined;
  if (sessions.get(conv.id) === session) sessions.delete(conv.id);
  // Turns end before the spawn is released: a turn's cost on a gateway provider is read off the
  // spawn's meter, which releasing drops. In-flight holds are charged once, here, not per turn.
  const turn = session.turn;
  session.turn = undefined;
  if (turn) {
    turn.stderrBuf = session.turnStderr;
    runs.endTurn(turn, code === 0 ? 1 : code, signal);
  }
  log.info("chat_session.exit", { convId: conv.id, code, signal, unread: session.unread.size, closing: session.closing });

  // `--resume` named a session this account does not have: start fresh rather than fail every message.
  if (!session.closing && session.resumed && session.turnsOpened === 0 && session.stderrBuf.includes(MISSING_SESSION)) {
    releaseSpawn(session);
    log.warn("chat_session.retry_no_resume", { convId: conv.id });
    db.updateConversation(conv.id, { sessionId: null });
    const fresh = { ...conv, sessionId: null };
    void serialized(conv.id, async () => {
      const pending = db.listPendingInputs(conv.id);
      if (pending.length === 0 || sessions.has(conv.id)) return;
      const request = summonRequestFor(conv, pending[0]!, null, {});
      const preparation = await prepareSummon(request, { streamInput: true });
      if ("error" in preparation) {
        log.warn("chat_session.fresh_start_failed", { convId: conv.id, code: preparation.error.code });
        emit({ type: "exited", convId: conv.id, sessionId: null, unreadIds: pending.map((p) => p.id) });
        return;
      }
      spawnSession({ conv: fresh, prepared: preparation.prepared, specKey: specKeyOf(preparation.prepared), capped: false, pending, freshSession: true });
    });
    return;
  }

  // It died before reading what it was sent (not signed in, a flag it rejects): the first message
  // becomes a failed turn that says why, rather than going to a new process that dies the same way.
  const [head] = session.unread.values();
  if (head && !turn && !session.closing) {
    openTurn(session, head);
    const failed = session.turn as LiveRun | undefined;
    session.turn = undefined;
    if (failed) {
      failed.stderrBuf = session.stderrBuf;
      runs.endTurn(failed, code === 0 ? 1 : code, signal);
    }
  }
  releaseSpawn(session);
  emit({ type: "exited", convId: conv.id, sessionId: session.sessionId ?? null, unreadIds: [...session.unread.keys()] });
}

function releaseSpawn(session: ChatSession): void {
  chargeOutstandingHolds(session.ownerId);
  releaseProviderSpawn(session.ownerId, session.spawn.pinFile);
}

/** Kill every chat process (server shutdown). Their unread messages stay unread for the next start. */
export function killAllSessions(): void {
  for (const s of sessions.values()) {
    s.closing = true;
    runs.killRunProc(s.proc);
  }
}

/** Stop the conversation's process now ("New thread", the slot deleted). Unread messages stay unread. */
export function closeSession(convId: string): Promise<void> {
  const s = sessions.get(convId);
  return s ? close(s, isBusySession(s)) : Promise.resolve();
}

/** Make way for a one-shot run on this seat: true once no chat process holds it, false while one is working. */
export async function releaseIdleSeat(agentId: string, instanceId: string | undefined): Promise<boolean> {
  const key = seatKey(agentId, instanceId);
  for (const s of [...sessions.values()]) {
    if (seatKey(s.conv.agentId, s.conv.instanceId) !== key) continue;
    if (isBusySession(s)) return false;
    // In the conversation's own order, so a message being delivered right now is not cut off.
    await serialized(s.conv.id, () => close(s));
  }
  return true;
}

chatSessions.releaseIdleSeat = releaseIdleSeat;
chatSessions.instanceBusy = (instanceId) =>
  [...sessions.values()].some((s) => s.conv.instanceId === instanceId && !s.closing && isBusySession(s));
chatSessions.stopIdleInstance = (instanceId) => {
  for (const s of sessions.values()) {
    if (s.conv.instanceId !== instanceId || isBusySession(s)) continue;
    s.closing = true;
    runs.killRunProc(s.proc);
  }
};
