"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { UseRunStreamResult } from "./use-run-stream";
import type { ThreadItem } from "../format/thread-types";
import { apiFetch, ApiError } from "@agent-office/domain/hooks/api";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import type { PersistedRun } from "@agent-office/domain/types";
import { readChatEntry, useChatStateRegistry } from "../state/chat-state-registry";

export type ResumeError =
  | { kind: "missing"; message: string }
  | { kind: "transient"; message: string; status?: number };

export type RecoveredRun = {
  runId: string;
  partialChars: number;
  tokensOut: number;
  cost: number;
  exitCode: number;
};

export interface UseRunRecoveryParams {
  activeRunId: string | null;
  setActiveRunId: (id: string | null) => void;
  thread: ThreadItem[];
  setThread: Dispatch<SetStateAction<ThreadItem[]>>;
  stream: UseRunStreamResult;
  transcriptLoaded: boolean;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  tKey: string;
  qc: QueryClient;
}

export interface UseRunRecoveryResult {
  resumeProbed: boolean;
  resumeError: ResumeError | null;
  setResumeError: (err: ResumeError | null) => void;
  recovered: RecoveredRun | null;
  setRecovered: (r: RecoveredRun | null) => void;
  retryResume: () => void;
  dismissResume: () => void;
  // Resets all internal state — call this from the agent/instance switch effect.
  resetRecovery: () => void;
  // Exposes the refs so callers (doSubmit, newThread) can reset them directly.
  runStartIndexRef: MutableRefObject<number | null>;
  fallbackAttemptedRef: MutableRefObject<string | null>;
  /** Setter that mirrors writes to the per-tKey chat state registry so a
   *  ChatPanel remount for the same tKey can restore the splice index. */
  setRunStartIndex: (v: number | null) => void;
}

/**
 * Manages the three recovery effects that handle run resumption after a page
 * reload, server restart, or SSE reconnect:
 *
 * 1. Resume probe — fetches the stored activeRunId once on mount to decide
 *    whether to re-attach the stream or fall back to persisted output.
 * 2. Stream splice — splices live SSE items into the canonical thread at the
 *    correct index tracked by runStartIndexRef.
 * 3. Done/error fallback — when the SSE stream ends, clears the run slot and
 *    fetches persisted output if the stream delivered nothing.
 *
 * The refs are owned here and exposed so ChatPanel's submit / newThread
 * handlers can reset them without causing extra state round-trips.
 */
export function useRunRecovery({
  activeRunId,
  setActiveRunId,
  thread,
  setThread,
  stream,
  transcriptLoaded,
  sessionId,
  setSessionId,
  tKey,
  qc,
}: UseRunRecoveryParams): UseRunRecoveryResult {
  const [resumeProbed, setResumeProbed] = useState(false);
  const [resumeError, setResumeError] = useState<ResumeError | null>(null);
  const [recovered, setRecovered] = useState<RecoveredRun | null>(null);
  const [resumeAttempt, setResumeAttempt] = useState(0);

  const runStartIndexRef = useRef<number | null>(null);
  const fallbackAttemptedRef = useRef<string | null>(null);
  const patchEntry = useChatStateRegistry((s) => s.patchEntry);

  // Hydrate the ref from the per-tKey registry on every mount / tKey change.
  // This is what lets a ChatPanel remount (e.g. after a project-tab switch)
  // recover the current run's splice index without needing to re-derive it
  // from a full transcript reload.
  useEffect(() => {
    const cached = readChatEntry(tKey);
    runStartIndexRef.current = cached.runStartIndex;
  }, [tKey]);

  const setRunStartIndex = useCallback(
    (v: number | null) => {
      runStartIndexRef.current = v;
      patchEntry(tKey, { runStartIndex: v });
    },
    [tKey, patchEntry],
  );

  // ── Probe a stored runId once - drop it if the server has no record ──
  useEffect(() => {
    if (resumeProbed) return;
    if (!activeRunId) {
      setResumeProbed(true);
      return;
    }
    let cancelled = false;
    setResumeError(null);
    apiFetch<PersistedRun>(API_ROUTES.run(activeRunId))
      .then((run) => {
        if (cancelled) return;
        if (run.status !== "running") {
          if (run.output && run.output.trim().length > 0) {
            setThread((prev) => [
              ...prev,
              { kind: "agent-text", id: `r_${activeRunId}`, text: run.output, streaming: false },
            ]);
          }
          if (run.status === "error" && (run.exitCode === 130 || run.exitCode === -1)) {
            setRecovered({
              runId: run.id,
              partialChars: run.output?.length ?? 0,
              tokensOut: run.tokensOut,
              cost: run.cost,
              exitCode: run.exitCode ?? -1,
            });
          }
          setActiveRunId(null);
        } else {
          // Still running - mark where this run's output goes in the thread.
          // Only set if the parent hasn't already written the authoritative
          // value (which lives in the registry — a remount for the same tKey
          // hydrates the ref from there before this effect runs).
          if (runStartIndexRef.current === null) {
            setRunStartIndex(thread.length);
          }
        }
        setResumeProbed(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setResumeError({ kind: "missing", message: err.message || "not_found" });
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          const status = err instanceof ApiError ? err.status : undefined;
          setResumeError({ kind: "transient", message: msg || "couldn't reach server", status });
        }
        setResumeProbed(true);
      });
    return () => {
      cancelled = true;
    };
    // thread intentionally omitted - only fire once per runId/attempt.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRunId, resumeProbed, resumeAttempt]);

  // ── Splice live stream items into the canonical thread ──
  useEffect(() => {
    const startIdx = runStartIndexRef.current;
    if (startIdx === null) return;
    if (stream.thread.length === 0 && stream.phase !== "done" && stream.phase !== "error") return;
    setThread((prev) => {
      const safeIdx = Math.min(startIdx, prev.length);
      return [...prev.slice(0, safeIdx), ...stream.thread];
    });
  }, [stream.thread, stream.phase, setThread]);

  // ── On done/error: clear the run slot, fall back if no text arrived ──
  useEffect(() => {
    if (stream.phase !== "done" && stream.phase !== "error") return;
    if (!activeRunId) return;
    const runId = activeRunId;
    const startIdx = runStartIndexRef.current;

    const hasText = stream.thread.some(
      (it) => it.kind === "agent-text" && it.text.trim().length > 0,
    );
    const hasStreamedFeedback = hasText || stream.thread.some((it) => it.kind === "system-error");
    const shouldFallback =
      stream.phase === "done" && !hasStreamedFeedback && fallbackAttemptedRef.current !== runId;

    setRunStartIndex(null);
    fallbackAttemptedRef.current = runId;
    setActiveRunId(null);
    qc.invalidateQueries({ queryKey: queryKeys.runs.all });

    if (stream.phase === "done" && stream.sessionId) {
      // Setting sessionId triggers ChatPanel's write-through effect, which
      // saves the full transcript (including the queued-messages backlog).
      // Calling saveTranscript here directly would clobber that backlog
      // because this hook has no reference to it.
      setSessionId(stream.sessionId);
    }

    if (!shouldFallback) return;
    apiFetch<PersistedRun>(API_ROUTES.run(runId))
      .then((run) => {
        setThread((prev) => {
          if (startIdx === null) return prev;
          const before = prev.slice(0, startIdx);
          const after = prev.slice(startIdx);
          if (run.output && run.output.trim().length > 0) {
            return [
              ...before,
              { kind: "agent-text", id: `r_${runId}`, text: run.output, streaming: false },
              ...after,
            ];
          }
          const detail = run.status === "error" ? `exit ${run.exitCode ?? 1}` : undefined;
          return [...before, { kind: "system-error", id: `e_${runId}`, code: "no_output", detail }, ...after];
        });
      })
      .catch(() => {
        setThread((prev) => {
          if (startIdx === null) return prev;
          const before = prev.slice(0, startIdx);
          const after = prev.slice(startIdx);
          return [
            ...before,
            { kind: "system-error", id: `e_${runId}`, code: "server_restart" },
            ...after,
          ];
        });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.phase, stream.thread, stream.sessionId, activeRunId, qc, sessionId, transcriptLoaded]);

  const retryResume = () => {
    setResumeError(null);
    setResumeProbed(false);
    setResumeAttempt((n) => n + 1);
  };

  const dismissResume = () => {
    setResumeError(null);
    setActiveRunId(null);
    setResumeProbed(true);
  };

  const resetRecovery = () => {
    setResumeProbed(false);
    setResumeError(null);
    setRecovered(null);
    setResumeAttempt(0);
    setRunStartIndex(null);
    fallbackAttemptedRef.current = null;
  };

  return {
    resumeProbed,
    resumeError,
    setResumeError,
    recovered,
    setRecovered,
    retryResume,
    dismissResume,
    resetRecovery,
    setRunStartIndex,
    runStartIndexRef,
    fallbackAttemptedRef,
  };
}
