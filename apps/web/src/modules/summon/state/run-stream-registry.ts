"use client";

import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { RunStreamEvent } from "@agent-office/domain/types";
import { applySseEvent, parseSseEvent, type SseEventName } from "../format/parse-sse-event";
import type { RunPhase, ThreadItem, UsageMeter } from "../format/thread-types";
import { notifyRunOutcome } from "./run-notify";

/**
 * Global registry of live `EventSource`s per run id.
 *
 * The problem this solves: `useRunStream` used to open its EventSource
 * inside a `useEffect`, and the cleanup closed it on unmount. That meant
 * switching project tabs — which unmounts the `ChatPanel` in the old
 * ChatPanel-A → mounts a fresh ChatPanel-B on tab-B path — killed any
 * in-flight stream sitting in ChatPanel-A. Tokens stopped mid-generation.
 *
 * The registry decouples the EventSource lifecycle from the React component
 * lifecycle:
 *
 *   - `subscribeToRunStream(runId, listener)` opens the stream if it isn't
 *     already open, adds the listener, and returns an unsubscribe.
 *   - The stream stays open until the server sends `done` / `error`, at which
 *     point we cache the terminal state and close the socket. Subsequent
 *     subscribers to the same runId still receive the cached final state
 *     (until the whole page reloads).
 *   - Unsubscribing does NOT close the stream — that's the whole point. A
 *     stream you left behind in another tab keeps streaming into the registry
 *     and pops back into the UI when you return.
 *
 * `reconnectRunStream(runId)` force-closes and re-opens the current stream
 * (used by the "connection lost — retry" button in `chat-panel-body.tsx`).
 *
 * ## Notification ownership
 *
 * This registry is also the single place that decides whether a run's
 * outcome is worth a chime + desktop notification (`run-notify.ts`). That
 * decision used to live in a React hook (`useRunNotification`) mounted per
 * `ChatPanel`, keyed off "did `phase` change since my last render". That
 * broke in exactly the way a per-mount heuristic always breaks: any
 * remount — a project-tab switch, the agent-details modal opening, a dev
 * Fast Refresh — re-subscribes to this SAME entry, which may already be
 * cached as `done`/`error` from long ago, and the hook's fresh `prevPhase`
 * ref reads that as a brand-new transition and dings for a run that
 * finished an hour ago. Two panels watching the same run doubled the ding.
 *
 * The fix: track the "has this run's outcome already been announced" flag
 * on the `Entry` itself (`notified`), not per-subscriber. An entry is
 * created once per `runId` and lives for the browser tab's session, so this
 * guard is inherently a one-shot regardless of how many components ever
 * subscribe or how many times they remount.
 *
 * That alone isn't enough, though — it doesn't stop the *first* replay
 * within a session (e.g. reopening a chat whose run finished 20 minutes
 * ago, before any subscriber existed) from reading as a fresh completion.
 * `entry.everLive` closes that gap: it's set only when the very first
 * `attached` event reports `status: "running"` — i.e. we were genuinely
 * watching this run while it was still executing, as opposed to attaching
 * to (or replaying) history for a run that was already finished. Only
 * entries that were ever live are eligible to notify.
 */

export type ConnectionState = "idle" | "connecting" | "open" | "retrying" | "lost";

export interface RunStreamState {
  thread: ThreadItem[];
  usage: UsageMeter;
  phase: RunPhase;
  error: string | null;
  connection: ConnectionState;
  lastEventAt: number | null;
  sessionId: string | null;
  startTs: number | null;
}

export const INITIAL_STREAM_STATE: RunStreamState = {
  thread: [],
  usage: { tokensIn: 0, tokensOut: 0, cost: 0 },
  phase: "idle",
  error: null,
  connection: "idle",
  lastEventAt: null,
  sessionId: null,
  startTs: null,
};

const EVENT_NAMES: readonly SseEventName[] = [
  "attached",
  "chunk",
  "tool",
  "usage",
  "done",
  "error",
  "rate-limit",
  "subagent",
  "subagent-update",
] as const;

const MAX_RETRY_ATTEMPTS = 3;

type Entry = {
  runId: string;
  state: RunStreamState;
  source: EventSource | null;
  listeners: Set<(s: RunStreamState) => void>;
  retryCount: number;
  cleanupHandlers: () => void;
  /** Display name for the desktop notification title. Set by whichever
   *  subscriber knows it (normally `ChatPanel`, via `useRunStream`'s second
   *  arg) — a run only ever belongs to one agent, so last-write is fine. */
  agentName: string | undefined;
  /** True once we've observed this run genuinely executing (an `attached`
   *  event reporting `status: "running"`) rather than just discovering it
   *  already finished. Gates notification — see file header comment. */
  everLive: boolean;
  /** Wall-clock ms when `everLive` first became true. Fallback duration
   *  source when the server doesn't report `durationMs` (e.g. an `error`
   *  event, whose schema has no duration field). */
  liveObservedAt: number | null;
  /** One-shot guard: has this run's outcome already been announced? Lives
   *  on the entry (not a subscriber) so N mounts / N remounts of the same
   *  run only ever produce one chime. */
  notified: boolean;
};

const registry = new Map<string, Entry>();

function notify(entry: Entry) {
  for (const listener of entry.listeners) listener(entry.state);
}

/**
 * Marks `entry.everLive` the first time we see genuine execution — an
 * `attached` event reporting `status: "running"` — as opposed to attaching
 * to (or replaying) a run that was already finished. See the "Notification
 * ownership" section in the file header for why this matters.
 */
function trackLiveness(entry: Entry, event: RunStreamEvent, now: number): void {
  if (event.name === "attached" && event.data.status === "running" && !entry.everLive) {
    entry.everLive = true;
    entry.liveObservedAt = now;
  }
}

/**
 * Fires the one-shot "needs a reply" ding on a hard rate-limit hit, ahead of
 * whatever terminal event follows it, and consumes the entry's notify guard
 * so the CLI's own graceful exit right after doesn't also ding — a
 * rate-limited run that exits 0 reports as plain "done" (see `finalizeRun`
 * in the domain package), which would otherwise read as a second, redundant
 * "finished successfully" notification.
 */
function notifyRateLimitIfHard(entry: Entry, event: RunStreamEvent): void {
  if (event.name !== "rate-limit" || event.data.severity !== "limit" || entry.notified) return;
  entry.notified = true;
  notifyRunOutcome({ kind: "rate-limit", agentName: entry.agentName, durationMs: undefined });
}

/**
 * Fires the one-shot "finished" / "needs attention" ding the first time
 * this entry reaches a terminal phase, gated on having watched the run
 * genuinely live (`entry.everLive`) — see file header comment.
 */
function notifyTerminalIfDue(
  entry: Entry,
  event: RunStreamEvent,
  wasTerminal: boolean,
  phase: RunPhase,
  now: number,
): void {
  const becameTerminal = !wasTerminal && (phase === "done" || phase === "error");
  if (!becameTerminal || !entry.everLive || entry.notified) return;
  entry.notified = true;
  const serverDurationMs = event.name === "done" ? event.data.durationMs : undefined;
  const observedDurationMs = entry.liveObservedAt ? now - entry.liveObservedAt : undefined;
  notifyRunOutcome({
    kind: phase === "done" ? "done" : "error",
    agentName: entry.agentName,
    durationMs: serverDurationMs ?? observedDurationMs,
  });
}

function openStream(runId: string): Entry {
  const entry: Entry = {
    runId,
    state: { ...INITIAL_STREAM_STATE, phase: "starting", connection: "connecting" },
    source: null,
    listeners: new Set(),
    retryCount: 0,
    cleanupHandlers: () => {},
    agentName: undefined,
    everLive: false,
    liveObservedAt: null,
    notified: false,
  };
  attachSource(entry);
  return entry;
}

function attachSource(entry: Entry) {
  // Close any previous socket first (used by reconnect).
  entry.source?.close();

  const source = new EventSource(API_ROUTES.runStream(entry.runId));
  entry.source = source;
  entry.state = { ...INITIAL_STREAM_STATE, phase: "starting", connection: "connecting" };
  notify(entry);

  const onOpen = () => {
    entry.retryCount = 0;
    entry.state = { ...entry.state, connection: "open" };
    notify(entry);
  };
  source.addEventListener("open", onOpen);

  const handlerRefs: Array<[SseEventName, (e: MessageEvent) => void]> = [];

  for (const name of EVENT_NAMES) {
    const handler = (e: MessageEvent) => {
      let raw: unknown;
      try { raw = JSON.parse(e.data); } catch { return; }
      const event = parseSseEvent(name, raw);
      if (!event) return;
      const now = Date.now();

      trackLiveness(entry, event, now);
      const wasTerminal = entry.state.phase === "done" || entry.state.phase === "error";

      const next = applySseEvent(
        { thread: entry.state.thread, usage: entry.state.usage, startTs: entry.state.startTs },
        event,
      );
      const phase: RunPhase = next.error
        ? "error"
        : next.done
          ? "done"
          : entry.state.phase === "starting"
            ? "streaming"
            : entry.state.phase;
      entry.state = {
        thread: next.thread,
        usage: next.usage,
        phase,
        error: next.error ?? entry.state.error,
        connection: "open",
        lastEventAt: now,
        sessionId: next.sessionId !== undefined ? next.sessionId : entry.state.sessionId,
        startTs: next.startTs !== undefined ? next.startTs : entry.state.startTs,
      };
      notify(entry);

      notifyRateLimitIfHard(entry, event);
      notifyTerminalIfDue(entry, event, wasTerminal, phase, now);

      if (name === "done") {
        // Server signalled completion — release the socket. Terminal state
        // stays in the entry so late subscribers still get it.
        source.close();
        entry.source = null;
      }
    };
    handlerRefs.push([name, handler]);
    source.addEventListener(name, handler);
  }

  source.onerror = () => {
    const givenUp = source.readyState === 2;
    entry.retryCount += 1;
    if (givenUp || entry.retryCount >= MAX_RETRY_ATTEMPTS) {
      try { source.close(); } catch { /* already closed */ }
      entry.source = null;
      entry.state = {
        ...entry.state,
        connection: "lost",
        error: entry.state.error ?? "stream connection lost",
      };
      notify(entry);
      return;
    }
    entry.state = { ...entry.state, connection: "retrying" };
    notify(entry);
  };

  entry.cleanupHandlers = () => {
    source.removeEventListener("open", onOpen);
    for (const [name, handler] of handlerRefs) source.removeEventListener(name, handler);
  };
}

/**
 * Subscribe to updates for the given runId. Idempotently opens the underlying
 * EventSource on first subscribe. Returns an unsubscribe that removes the
 * listener; the stream itself keeps running until it receives `done` or the
 * page reloads.
 *
 * The listener is invoked synchronously with the current cached state so the
 * caller doesn't need a separate `getRunStreamState()` call to seed local
 * state.
 *
 * `agentName`, if given, is stored on the entry for the desktop notification
 * title — see the "Notification ownership" section above. Optional and
 * last-write-wins: a run only ever belongs to one agent, so any subscriber
 * that knows the name is as good as any other.
 */
export function subscribeToRunStream(
  runId: string,
  listener: (state: RunStreamState) => void,
  agentName?: string,
): () => void {
  let entry = registry.get(runId);
  if (!entry) {
    entry = openStream(runId);
    registry.set(runId, entry);
  }
  if (agentName) entry.agentName = agentName;
  entry.listeners.add(listener);
  listener(entry.state);
  return () => {
    entry?.listeners.delete(listener);
    // NB: we deliberately do NOT close the source when refCount hits zero.
    // See file-header comment.
  };
}

/**
 * Synchronous read of the current cached state for `runId`, or
 * `INITIAL_STREAM_STATE` if nothing is registered yet.
 *
 * Exists so `useRunStream` can seed its `useState` from this directly (a
 * lazy initializer, which runs during render) instead of hardcoding
 * `INITIAL_STREAM_STATE` and waiting for a `useEffect` to correct it a tick
 * later. That tick-late correction was a real bug, not just a cosmetic
 * flash: on every remount of a `ChatPanel` for a run that's genuinely still
 * streaming (e.g. returning to a project tab), the first render — and
 * everything derived from it, including the `isStreaming` gate in
 * `onSubmit` (use-chat-actions.ts) — saw `phase: "idle"` even though the
 * registry already knew the run was live. A message sent in that exact
 * window skipped the send queue entirely, hit `/api/summon` for a target
 * that was already running, and (before `startSummonRun`'s guard was
 * corrected to reject non-duplicate concurrent prompts instead of silently
 * substituting the existing run) vanished with no trace. Confirmed in
 * production logs: `summon.duplicate_suppressed` fired for a queued message
 * that never got its own run.
 */
export function peekRunStreamState(runId: string): RunStreamState {
  return registry.get(runId)?.state ?? INITIAL_STREAM_STATE;
}

/**
 * Force-close and re-open the EventSource for `runId`. No-op if the run is
 * absent from the registry — usually because subscription hasn't happened
 * yet. Used by the UI's "connection lost — retry" affordance.
 */
export function reconnectRunStream(runId: string): void {
  const entry = registry.get(runId);
  if (!entry) return;
  entry.cleanupHandlers();
  entry.retryCount = 0;
  attachSource(entry);
}
