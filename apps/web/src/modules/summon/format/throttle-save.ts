import type { ThreadItem } from "./thread-types";
import type { QueuedMessage } from "./transcript-store";

export interface SaveArgs {
  tKey: string;
  thread: ThreadItem[];
  activeRunId: string | null;
  sessionId: string | null;
  queuedMessages: QueuedMessage[];
}

export interface TranscriptSaver {
  /** Record newest state. Idle (activeRunId===null) saves now; a running turn
   *  coalesces into at most one save per window, always with the latest data. */
  schedule: (args: SaveArgs) => void;
  /** Flush a pending throttled save (e.g. on unmount). No-op if none pending. */
  flushPending: () => void;
  hasPending: () => boolean;
}

/**
 * Throttle transcript persistence so a streaming run — which mutates the
 * thread once per token — doesn't JSON.stringify + PUT the whole (multi-MB)
 * transcript on every token. Trailing edge, newest-wins.
 */
export function createTranscriptSaver(save: (args: SaveArgs) => void, windowMs = 1000): TranscriptSaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: SaveArgs | null = null;

  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (latest) save(latest);
  };

  return {
    schedule(args) {
      latest = args;
      if (args.activeRunId === null) { flush(); return; }
      if (timer) return;
      timer = setTimeout(() => { timer = null; flush(); }, windowMs);
    },
    flushPending() { if (timer) flush(); },
    hasPending() { return timer !== null; },
  };
}
