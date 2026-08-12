"use client";

import { API_ROUTES } from "@agent-office/domain/config/routes";
import { applySseEvent, parseSseEvent, type SseEventName } from "../format/parse-sse-event";
import type { RunPhase, ThreadItem, UsageMeter } from "../format/thread-types";

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
};

const registry = new Map<string, Entry>();

function notify(entry: Entry) {
  for (const listener of entry.listeners) listener(entry.state);
}

function openStream(runId: string): Entry {
  const entry: Entry = {
    runId,
    state: { ...INITIAL_STREAM_STATE, phase: "starting", connection: "connecting" },
    source: null,
    listeners: new Set(),
    retryCount: 0,
    cleanupHandlers: () => {},
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
 */
export function subscribeToRunStream(
  runId: string,
  listener: (state: RunStreamState) => void,
): () => void {
  let entry = registry.get(runId);
  if (!entry) {
    entry = openStream(runId);
    registry.set(runId, entry);
  }
  entry.listeners.add(listener);
  listener(entry.state);
  return () => {
    entry?.listeners.delete(listener);
    // NB: we deliberately do NOT close the source when refCount hits zero.
    // See file-header comment.
  };
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
