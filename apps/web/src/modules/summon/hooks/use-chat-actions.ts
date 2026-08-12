"use client";

import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { clearDraft } from "../format/draft-store";
import { clearTranscript } from "../format/transcript-store";
import type { ChatPhase } from "../components/live-status";
import { isRunErrorCode } from "@agent-office/domain/config/run-errors";
import type { ContextProfile } from "@agent-office/domain/types";
import { ApiError } from "@/lib/api-client";
import type { ThreadItem } from "../format/thread-types";
import type { useSummon, useAbortRun } from "./use-summon";

type SummonMutation = ReturnType<typeof useSummon>;
type AbortMutation = ReturnType<typeof useAbortRun>;

export type UseChatActionsInput = {
  agentId: string;
  projectId: string | undefined;
  instanceId: string | undefined;
  tKey: string;
  summon: SummonMutation;
  abort: AbortMutation;
  sessionId: string | null;
  contextProfile: ContextProfile;
  phase: ChatPhase;
  isStreaming: boolean;
  activeRunId: string | null;
  setActiveRunId: Dispatch<SetStateAction<string | null>>;
  setThread: Dispatch<SetStateAction<ThreadItem[]>>;
  setSessionId: Dispatch<SetStateAction<string | null>>;
  setPhaseOverride: Dispatch<SetStateAction<ChatPhase | null>>;
  setQuotaWarning: Dispatch<SetStateAction<string | null>>;
  queuedMessages: Array<{ id: string; text: string }>;
  setQueuedMessages: Dispatch<SetStateAction<Array<{ id: string; text: string }>>>;
  runStartIndexRef: MutableRefObject<number | null>;
  /** Registry-backed setter that mirrors ref writes to the per-tKey chat
   *  state entry so a ChatPanel remount can restore the splice index
   *  without a full transcript reload. */
  setRunStartIndex: (v: number | null) => void;
  fallbackAttemptedRef: MutableRefObject<string | null>;
  newThreadSignal: number | undefined;
};

export type UseChatActionsResult = {
  onSubmit: (text: string) => void;
  onAbort: () => void;
  newThread: () => void;
};

type SummonInput = {
  agentId: string;
  projectId: string | undefined;
  instanceId: string | undefined;
  sessionId: string | null;
  contextProfile: ContextProfile;
  summon: SummonMutation;
  setThread: Dispatch<SetStateAction<ThreadItem[]>>;
  setActiveRunId: Dispatch<SetStateAction<string | null>>;
  setPhaseOverride: Dispatch<SetStateAction<ChatPhase | null>>;
  setQuotaWarning: Dispatch<SetStateAction<string | null>>;
  setRunStartIndex: (v: number | null) => void;
};

/** Bare send closure. Wraps the summon mutation with thread-updating side effects. */
function makeDoSubmit(cfg: SummonInput): (text: string) => void {
  return (text: string) => {
    const userItem: ThreadItem = { kind: "you", id: `y_${Date.now()}`, text };
    cfg.setThread((prev) => {
      cfg.setRunStartIndex(prev.length + 1);
      return [...prev, userItem];
    });
    cfg.setPhaseOverride("sending");
    cfg.summon.mutate(
      {
        agentId: cfg.agentId,
        prompt: text,
        projectId: cfg.projectId,
        instanceId: cfg.instanceId,
        resumeSessionId: cfg.sessionId ?? undefined,
        contextProfile: cfg.contextProfile,
      },
      {
        onSuccess: ({ runId, warning }) => {
          cfg.setActiveRunId(runId);
          cfg.setPhaseOverride(null);
          if (warning) cfg.setQuotaWarning(warning);
        },
        onError: (err) => {
          cfg.setRunStartIndex(null);
          // The summon POST returns `{ error: <code>, detail }` — ApiError puts
          // the code in `.message` and the human text in `.data.detail`.
          const rawCode = err instanceof ApiError ? err.message : undefined;
          const code = isRunErrorCode(rawCode) ? rawCode : "start_failed";
          const detail =
            (err instanceof ApiError && typeof err.data?.detail === "string" ? err.data.detail : undefined) ??
            (code === "start_failed" && err instanceof Error ? err.message : undefined);
          cfg.setThread((prev) => [
            ...prev,
            { kind: "system-error", id: `e_${Date.now()}`, code, detail },
          ]);
          cfg.setPhaseOverride(null);
        },
      },
    );
  };
}

/**
 * Bundles the chat-lifecycle action closures (send/abort/new-thread) and the
 * queue-drain + external new-thread-signal effects into a single hook. Keeps
 * the presentational `ChatPanel` free of async control-flow and side effects.
 */
export function useChatActions(input: UseChatActionsInput): UseChatActionsResult {
  const doSubmit = makeDoSubmit({
    agentId: input.agentId,
    projectId: input.projectId,
    instanceId: input.instanceId,
    sessionId: input.sessionId,
    contextProfile: input.contextProfile,
    summon: input.summon,
    setThread: input.setThread,
    setActiveRunId: input.setActiveRunId,
    setPhaseOverride: input.setPhaseOverride,
    setQuotaWarning: input.setQuotaWarning,
    setRunStartIndex: input.setRunStartIndex,
  });

  const onSubmit = (text: string) => {
    if (input.isStreaming || input.queuedMessages.length > 0) {
      input.setQueuedMessages((prev) => [...prev, { id: `q_${Date.now()}_${prev.length}`, text }]);
      return;
    }
    doSubmit(text);
  };

  const onAbort = () => {
    if (!input.activeRunId) return;
    input.abort.mutate(input.activeRunId, {
      onSuccess: () => {
        input.setPhaseOverride("aborted");
        input.setQueuedMessages([]);
      },
    });
  };

  const newThread = () => {
    void clearTranscript(input.tKey);
    void clearDraft(input.tKey);
    input.setThread([]);
    input.setActiveRunId(null);
    input.setSessionId(null);
    input.setPhaseOverride(null);
    input.setQueuedMessages([]);
    input.setRunStartIndex(null);
    input.fallbackAttemptedRef.current = null;
  };

  useNewThreadSignal(input.newThreadSignal, newThread);
  useQueueDrain(input.phase, input.queuedMessages, input.setQueuedMessages, doSubmit);

  return { onSubmit, onAbort, newThread };
}

/** Fires `newThread()` whenever the parent-shell `newThreadSignal` changes. */
function useNewThreadSignal(signal: number | undefined, newThread: () => void): void {
  const prev = useRef(signal ?? 0);
  useEffect(() => {
    const cur = signal ?? 0;
    if (cur === prev.current) return;
    prev.current = cur;
    newThread();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on signal change only; newThread captures stable setters
  }, [signal]);
}

/** Fires the next queued message once the current run finishes. */
function useQueueDrain(
  phase: ChatPhase,
  queuedMessages: Array<{ id: string; text: string }>,
  setQueuedMessages: Dispatch<SetStateAction<Array<{ id: string; text: string }>>>,
  doSubmit: (text: string) => void,
): void {
  useEffect(() => {
    if (phase !== "idle") return;
    if (queuedMessages.length === 0) return;
    const next = queuedMessages[0]!;
    setQueuedMessages((prev) => prev.slice(1));
    doSubmit(next.text);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- closure captures the right sessionId at idle transition
  }, [phase, queuedMessages]);
}
