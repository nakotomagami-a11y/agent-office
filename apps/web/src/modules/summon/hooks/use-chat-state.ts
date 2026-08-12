"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import type { ChatPhase } from "../components/live-status";
import type { ContextProfile } from "@agent-office/domain/types";
import type { ThreadItem } from "../format/thread-types";
import {
  DEFAULT_CHAT_ENTRY,
  useChatStateRegistry,
  type ChatStateEntry,
} from "../state/chat-state-registry";

export type QueuedMessage = { id: string; text: string };

export type ChatState = {
  thread: ThreadItem[];
  setThread: Dispatch<SetStateAction<ThreadItem[]>>;
  activeRunId: string | null;
  setActiveRunId: Dispatch<SetStateAction<string | null>>;
  sessionId: string | null;
  setSessionId: Dispatch<SetStateAction<string | null>>;
  pendingSeed: string | undefined;
  setPendingSeed: Dispatch<SetStateAction<string | undefined>>;
  phaseOverride: ChatPhase | null;
  setPhaseOverride: Dispatch<SetStateAction<ChatPhase | null>>;
  queuedMessages: QueuedMessage[];
  setQueuedMessages: Dispatch<SetStateAction<QueuedMessage[]>>;
  quotaWarning: string | null;
  setQuotaWarning: Dispatch<SetStateAction<string | null>>;
  contextProfile: ContextProfile;
  setContextProfile: Dispatch<SetStateAction<ContextProfile>>;
  transcriptLoaded: boolean;
  setTranscriptLoaded: Dispatch<SetStateAction<boolean>>;
};

/**
 * All of `ChatPanel`'s useState declarations, delegated to the per-tKey
 * `useChatStateRegistry` so unmount+remount of the panel (which happens on
 * every project-tab switch) doesn't lose the thread, active run, queued
 * messages, composer seed, phase override, or transcriptLoaded bit.
 *
 * The returned object is API-compatible with the old local-state version —
 * every setter accepts a value or an updater fn, and each read is a live
 * Zustand selector so React rerenders only when the field it uses changes.
 *
 * `tKey` is stable per (agentId, instanceId) and derived by the caller in
 * `useChatPanelModel`; passing it here means the registry can key state by
 * conversation identity rather than component lifetime.
 */
export function useChatState(tKey: string): ChatState {
  const patchEntry = useChatStateRegistry((s) => s.patchEntry);

  // Single Zustand subscription over this tKey's entry. React rerenders here
  // when ANY field changes — same granularity as ChatPanel had before via
  // co-located useState calls (each setState triggered a full rerender too).
  const entry = useChatStateRegistry((s) => s.entries[tKey]);
  const snapshot: ChatStateEntry = entry ?? DEFAULT_CHAT_ENTRY;

  // One factory that produces useState-shaped setters that write into the
  // registry. Memoised on tKey so downstream effect deps stay stable across
  // renders of the same tKey.
  const setters = useMemo(() => {
    function makeSetter<K extends keyof ChatStateEntry>(field: K) {
      return (arg: ChatStateEntry[K] | ((prev: ChatStateEntry[K]) => ChatStateEntry[K])) => {
        const prev = useChatStateRegistry.getState().entries[tKey] ?? DEFAULT_CHAT_ENTRY;
        const nextVal =
          typeof arg === "function"
            ? (arg as (p: ChatStateEntry[K]) => ChatStateEntry[K])(prev[field])
            : arg;
        patchEntry(tKey, { [field]: nextVal } as Partial<ChatStateEntry>);
      };
    }
    return {
      setThread: makeSetter("thread"),
      setActiveRunId: makeSetter("activeRunId"),
      setSessionId: makeSetter("sessionId"),
      setPendingSeed: makeSetter("pendingSeed"),
      setPhaseOverride: makeSetter("phaseOverride"),
      setQueuedMessages: makeSetter("queuedMessages"),
      setQuotaWarning: makeSetter("quotaWarning"),
      setContextProfile: makeSetter("contextProfile"),
      setTranscriptLoaded: makeSetter("transcriptLoaded"),
    };
  }, [tKey, patchEntry]);

  const {
    setThread,
    setActiveRunId,
    setSessionId,
    setPendingSeed,
    setPhaseOverride,
    setQueuedMessages,
    setQuotaWarning,
    setContextProfile,
    setTranscriptLoaded,
  } = setters;

  return useMemo<ChatState>(
    () => ({
      thread: snapshot.thread,
      setThread: setThread as Dispatch<SetStateAction<ThreadItem[]>>,
      activeRunId: snapshot.activeRunId,
      setActiveRunId: setActiveRunId as Dispatch<SetStateAction<string | null>>,
      sessionId: snapshot.sessionId,
      setSessionId: setSessionId as Dispatch<SetStateAction<string | null>>,
      pendingSeed: snapshot.pendingSeed,
      setPendingSeed: setPendingSeed as Dispatch<SetStateAction<string | undefined>>,
      phaseOverride: snapshot.phaseOverride,
      setPhaseOverride: setPhaseOverride as Dispatch<SetStateAction<ChatPhase | null>>,
      queuedMessages: snapshot.queuedMessages,
      setQueuedMessages: setQueuedMessages as Dispatch<SetStateAction<QueuedMessage[]>>,
      quotaWarning: snapshot.quotaWarning,
      setQuotaWarning: setQuotaWarning as Dispatch<SetStateAction<string | null>>,
      contextProfile: snapshot.contextProfile,
      setContextProfile: setContextProfile as Dispatch<SetStateAction<ContextProfile>>,
      transcriptLoaded: snapshot.transcriptLoaded,
      setTranscriptLoaded: setTranscriptLoaded as Dispatch<SetStateAction<boolean>>,
    }),
    [
      snapshot,
      setThread,
      setActiveRunId,
      setSessionId,
      setPendingSeed,
      setPhaseOverride,
      setQueuedMessages,
      setQuotaWarning,
      setContextProfile,
      setTranscriptLoaded,
    ],
  );
}
