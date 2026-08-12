"use client";

import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { loadTranscript, saveTranscript } from "../format/transcript-store";
import { createTranscriptSaver, type TranscriptSaver } from "../format/throttle-save";
import { readChatEntry } from "../state/chat-state-registry";
import type { ThreadItem } from "../format/thread-types";

export type TranscriptSyncInput = {
  tKey: string;
  thread: ThreadItem[];
  setThread: Dispatch<SetStateAction<ThreadItem[]>>;
  activeRunId: string | null;
  setActiveRunId: Dispatch<SetStateAction<string | null>>;
  sessionId: string | null;
  setSessionId: Dispatch<SetStateAction<string | null>>;
  queuedMessages: Array<{ id: string; text: string }>;
  setQueuedMessages: Dispatch<SetStateAction<Array<{ id: string; text: string }>>>;
  setPhaseOverride: (v: null) => void;
  runStartIndexRef: MutableRefObject<number | null>;
  resetRecovery: () => void;
  /** Caller-owned so it can also be a dep of `useRunRecovery`. */
  transcriptLoaded: boolean;
  setTranscriptLoaded: Dispatch<SetStateAction<boolean>>;
};

export type TranscriptSyncResult = {
  loadedTKeyRef: MutableRefObject<string | null>;
};

/**
 * Owns the transcript persistence lifecycle for `ChatPanel`:
 *
 * - On `tKey` change, resets thread state and re-loads the row for that key.
 * - Guards the write-through effect with a ref so a stale render from the
 *   *previous* tKey can't clobber the new key's row (see the ref comment in
 *   the original chat-panel implementation for the full race description).
 *
 * The consumer stays responsible for owning the actual thread/activeRunId/
 * sessionId/queuedMessages state — this hook just synchronises it with the
 * server transcript row.
 */
export function useTranscriptSync(input: TranscriptSyncInput): TranscriptSyncResult {
  const loadedTKeyRef = useRef<string | null>(null);
  useLoadEffect(input, loadedTKeyRef);
  useWriteThroughEffect(input, loadedTKeyRef);
  return { loadedTKeyRef };
}

function useLoadEffect(input: TranscriptSyncInput, loadedTKeyRef: MutableRefObject<string | null>): void {
  const {
    tKey,
    setThread,
    setActiveRunId,
    setSessionId,
    setQueuedMessages,
    setPhaseOverride,
    runStartIndexRef,
    resetRecovery,
    setTranscriptLoaded,
  } = input;

  useEffect(() => {
    // Fast-path: the tabs rework means ChatPanel remounts on every project-tab
    // switch even when the *conversation* (tKey) is unchanged. If the per-tKey
    // registry already has `transcriptLoaded: true`, the DB row and the
    // in-memory state agree — skip the reload, just re-arm the write-through
    // guard so future edits still persist.
    //
    // Active-run case: the registry ALSO tracks `runStartIndex` per tKey and
    // `useRunRecovery` hydrates its ref from there on mount, so the splice
    // math survives unmount+remount without needing a fresh DB probe. The
    // run-stream-registry keeps the EventSource alive across unmount, so
    // tokens accumulate into the shared stream state and re-render the
    // returning tab exactly where it left off.
    const cached = readChatEntry(tKey);
    if (cached.transcriptLoaded) {
      loadedTKeyRef.current = tKey;
      return;
    }

    setTranscriptLoaded(false);
    setThread([]);
    setActiveRunId(null);
    setSessionId(null);
    setPhaseOverride(null);
    setQueuedMessages([]);
    // Invalidate the write-through guard immediately — see chat-panel comment.
    loadedTKeyRef.current = null;
    resetRecovery();
    let cancelled = false;
    loadTranscript(tKey).then((row) => {
      if (cancelled) return;
      const items = row?.items ?? [];
      setThread(items);
      setActiveRunId(row?.activeRunId ?? null);
      setSessionId(row?.sessionId ?? null);
      setQueuedMessages(row?.queuedMessages ?? []);
      // Pre-set the splice index NOW, before the first render that carries
      // activeRunId — the EventSource opens synchronously on that render.
      if (row?.activeRunId) runStartIndexRef.current = items.length;
      loadedTKeyRef.current = tKey;
      setTranscriptLoaded(true);
    }).catch(() => {
      if (cancelled) return;
      // Even on load failure the state is "empty for this key" — allow
      // future edits to be persisted under it.
      loadedTKeyRef.current = tKey;
      setTranscriptLoaded(true);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on tKey change only; setters and refs are stable
  }, [tKey]);
}

function useWriteThroughEffect(input: TranscriptSyncInput, loadedTKeyRef: MutableRefObject<string | null>): void {
  const { tKey, thread, activeRunId, sessionId, queuedMessages, transcriptLoaded } = input;

  // A streaming run mutates `thread` once per token; persisting on every
  // mutation JSON.stringify-s the entire (multi-MB, thousands of items)
  // transcript + PUTs it per token — the main-thread stall behind long-chat
  // lag. The saver coalesces those into one save per window (trailing edge,
  // newest data); idle turns still save immediately. The guard lives in the
  // save callback so a tKey switch mid-window can't clobber the new row.
  const saverRef = useRef<TranscriptSaver | null>(null);
  if (saverRef.current === null) {
    saverRef.current = createTranscriptSaver((a) => {
      if (loadedTKeyRef.current !== a.tKey) return;
      void saveTranscript(a.tKey, a.thread, a.activeRunId, a.sessionId, a.queuedMessages);
    });
  }

  useEffect(() => {
    if (!transcriptLoaded) return;
    if (loadedTKeyRef.current !== tKey) return;
    saverRef.current!.schedule({ tKey, thread, activeRunId, sessionId, queuedMessages });
  }, [tKey, thread, activeRunId, sessionId, transcriptLoaded, queuedMessages, loadedTKeyRef]);

  // Flush a pending throttled save on unmount so the last tokens aren't lost
  // when the panel closes mid-window.
  useEffect(() => () => saverRef.current?.flushPending(), []);
}
