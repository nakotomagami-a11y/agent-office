// App-wide domain event bus. Server code emits a coarse event on any state
// change without a direct client action (a run finishing, a scheduled job
// firing, ...). `/api/events` forwards these over SSE to one EventSource per
// browser tab, which maps each to `queryClient.invalidateQueries` — replacing
// per-hook `refetchInterval` polling.
//
// Events are coarse and payload-free (single-user app, so "invalidate the
// runs queries" is cheap and correct without threading ids through). Only
// events the server genuinely knows about without polling externally —
// things that watch OS/filesystem/OAuth state stay on their own client polls.
//
// globalThis-backed, like the live-run registry, so the listener set
// survives Next.js HMR reloads in dev.
export type AppEventType =
  | "runs:changed"
  | "spend:changed"
  | "conversations:changed"
  | "schedules:changed";

export type AppEventListener = (type: AppEventType) => void;

declare global {
  var __agentOfficeAppEventListeners: Set<AppEventListener> | undefined;
}

const listeners: Set<AppEventListener> =
  globalThis.__agentOfficeAppEventListeners ??
  (globalThis.__agentOfficeAppEventListeners = new Set());

/** Subscribe to app events. Returns an unsubscribe function. */
export function onAppEvent(fn: AppEventListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Emit an app event to all subscribers. Never throws — a bad listener must
 *  not break the mutation that triggered the event. */
export function emitAppEvent(type: AppEventType): void {
  for (const fn of listeners) {
    try {
      fn(type);
    } catch {
      /* drop bad listener silently — cleaned up on its own unsubscribe */
    }
  }
}
