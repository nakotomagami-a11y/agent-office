"use client";

import { create } from "zustand";
import type { ContextProfile } from "@agent-office/domain/types";
import type { ChatPhase } from "../components/live-status";
import type { QueuedMessage } from "../hooks/use-chat-state";
import type { ThreadItem } from "../format/thread-types";

/**
 * Per-`tKey` chat panel state, held OUTSIDE the ChatPanel component so
 * unmounting the panel (tab switch, modal close, agent-details modal close)
 * no longer wipes the conversation, the composer's pending seed, the queue,
 * the phase override, or the "we already fetched the transcript row" bit.
 *
 * `tKey` shape: `<agentId>::<instanceId>` (see `format/transcript-store.ts`).
 * The map is populated lazily — the first render for a given tKey materialises
 * a fresh entry from `DEFAULT_ENTRY`.
 *
 * Persistence: this store is memory-only. The authoritative transcript still
 * lives in the server DB via `/api/transcripts`; `useTranscriptSync` loads it
 * on first mount and write-throughs on change. What the registry buys us is
 * that a *remount* of the same tKey (which is what "switching project tabs"
 * causes today) doesn't blow away the in-memory copy — the panel just picks
 * up where it left off with zero DB round-trip.
 *
 * ## Cleanup
 * Entries live for the browser session. A hard reload clears them (state
 * rehydrates from the DB on next mount). Explicit `clearChatEntry(tKey)` is
 * exposed for "start a new thread" — it resets thread + activeRunId + queue
 * without evicting the entry itself, so setters keep working.
 */

export type ChatStateEntry = {
  thread: ThreadItem[];
  activeRunId: string | null;
  sessionId: string | null;
  pendingSeed: string | undefined;
  phaseOverride: ChatPhase | null;
  queuedMessages: QueuedMessage[];
  quotaWarning: string | null;
  contextProfile: ContextProfile;
  transcriptLoaded: boolean;
  /**
   * Index in `thread` where the currently-active run's streamed output
   * starts. Persisted across remounts so a mid-stream tab switch can
   * re-hydrate the splice index correctly — without this, a returning
   * subscriber to the stream registry would re-splice the full stream on
   * top of already-committed streamed items, duplicating content.
   * `null` when no run is active.
   */
  runStartIndex: number | null;
};

export const DEFAULT_CHAT_ENTRY: ChatStateEntry = {
  thread: [],
  activeRunId: null,
  sessionId: null,
  pendingSeed: undefined,
  phaseOverride: null,
  queuedMessages: [],
  quotaWarning: null,
  contextProfile: "balanced",
  transcriptLoaded: false,
  runStartIndex: null,
};

type ChatStateRegistryState = {
  /** Immutable map — every mutation replaces the whole object so Zustand
   *  can notify subscribers correctly. */
  entries: Record<string, ChatStateEntry>;
  /** Read-or-create. Returns a snapshot; use `patchEntry` to mutate. */
  ensureEntry: (tKey: string) => ChatStateEntry;
  /** Merge `patch` into the entry, creating it if absent. */
  patchEntry: (tKey: string, patch: Partial<ChatStateEntry>) => void;
  /** Reset thread/queue/run to empty but keep contextProfile and
   *  `transcriptLoaded=true` so we don't re-hit the DB. Used by "new thread". */
  resetThread: (tKey: string) => void;
};

export const useChatStateRegistry = create<ChatStateRegistryState>((set, get) => ({
  entries: {},

  ensureEntry: (tKey) => {
    const current = get().entries[tKey];
    if (current) return current;
    const fresh = { ...DEFAULT_CHAT_ENTRY };
    set((s) => ({ entries: { ...s.entries, [tKey]: fresh } }));
    return fresh;
  },

  patchEntry: (tKey, patch) => {
    set((s) => {
      const prev = s.entries[tKey] ?? DEFAULT_CHAT_ENTRY;
      const next = { ...prev, ...patch };
      return { entries: { ...s.entries, [tKey]: next } };
    });
  },

  resetThread: (tKey) => {
    set((s) => {
      const prev = s.entries[tKey] ?? DEFAULT_CHAT_ENTRY;
      const next: ChatStateEntry = {
        ...prev,
        thread: [],
        activeRunId: null,
        sessionId: null,
        queuedMessages: [],
        phaseOverride: null,
        pendingSeed: undefined,
        quotaWarning: null,
        runStartIndex: null,
        // Keep contextProfile + transcriptLoaded intact.
      };
      return { entries: { ...s.entries, [tKey]: next } };
    });
  },
}));

/** Convenience: read the entry for a given tKey without triggering a resave. */
export function readChatEntry(tKey: string): ChatStateEntry {
  return useChatStateRegistry.getState().entries[tKey] ?? DEFAULT_CHAT_ENTRY;
}
