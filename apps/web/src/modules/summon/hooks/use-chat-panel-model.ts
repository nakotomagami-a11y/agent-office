"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSummon, useAbortRun } from "./use-summon";
import { useRunStream } from "./use-run-stream";
import { useRunRecovery, type UseRunRecoveryResult } from "./use-run-recovery";
import { useRunNotification } from "@/hooks/use-run-notification";
import { useTranscriptSync } from "./use-transcript-sync";
import { useStreamingTick } from "./use-streaming-tick";
import { formatDateTime } from "@/lib/format-date";
import { useChatActions } from "./use-chat-actions";
import { useChatState, type ChatState } from "./use-chat-state";
import { transcriptKey } from "../format/transcript-store";
import { useProject } from "@/modules/projects/hooks/use-projects";
import { useBranchStore } from "@/lib/branch-store";
import { toast } from "@/lib/toast-store";
import {
  deriveChatPhase,
  findLastUserMessageText,
  isPhaseStreaming,
  sliceRunText,
  sumHistoryTokens,
} from "../format/derive-chat-phase";
import { deriveLiveStats, deriveStreamStaleness } from "../format/derive-live-stats";
import type { OfficeAgent } from "@/modules/office/hooks/use-office-agents";
import type { ChatPhase } from "../components/live-status";

type UseChatPanelModelInput = {
  agent: OfficeAgent;
  projectId: string | undefined;
  instanceId: string | undefined;
  newThreadSignal: number | undefined;
  onActiveRunChange: ((id: string | null) => void) | undefined;
};

export type ChatPanelModel = {
  tKey: string;
  projectName: string | undefined;
  state: ChatState;
  stream: ReturnType<typeof useRunStream>;
  recovery: UseRunRecoveryResult;
  phase: ChatPhase;
  isStreaming: boolean;
  liveStats: string | undefined;
  isStale: boolean;
  sinceLastEventMs: number | null;
  lastUserMessageText: string | null;
  onSubmit: (text: string) => void;
  onAbort: () => void;
  onCommand: (cmd: string) => void;
  onNewThread: () => void;
  onContinueRecovered: () => void;
  onResummonLastMessage: () => void;
  onScheduleRateLimit: (resetsAtSeconds: number) => Promise<void>;
  /** Schedule a resume at a user-chosen fire time (ms). */
  onScheduleResumeAt: (fireAtMs: number) => Promise<void>;
  /** Known rate-limit reset time (ms), offered as the recommended option. */
  resumeResetsAtMs: number | null;
  /** True when a rate-limit reset time is known for this thread. */
  canScheduleResume: boolean;
};

/**
 * Orchestration hook that wires up every hook + derivation the ChatPanel view
 * needs, so `ChatPanel` itself is a one-liner that hands the model off to
 * `ChatPanelBody`. Kept here rather than inline in the component per the
 * house rule that logic lives in hooks, not JSX.
 */
export function useChatPanelModel(input: UseChatPanelModelInput): ChatPanelModel {
  const qc = useQueryClient();
  const summon = useSummon();
  const abort = useAbortRun();
  const projectQ = useProject(input.projectId ?? null);
  const projectName = projectQ.data?.meta.name;
  const tKey = transcriptKey(input.agent.id, input.instanceId);

  const state = useChatState(tKey);
  const stream = useRunStream(state.activeRunId);

  const recovery = useRunRecovery({
    activeRunId: state.activeRunId,
    setActiveRunId: state.setActiveRunId,
    thread: state.thread,
    setThread: state.setThread,
    stream,
    transcriptLoaded: state.transcriptLoaded,
    sessionId: state.sessionId,
    setSessionId: state.setSessionId,
    tKey,
    qc,
  });

  useTranscriptSync({
    tKey,
    thread: state.thread,
    setThread: state.setThread,
    activeRunId: state.activeRunId,
    setActiveRunId: state.setActiveRunId,
    sessionId: state.sessionId,
    setSessionId: state.setSessionId,
    queuedMessages: state.queuedMessages,
    setQueuedMessages: state.setQueuedMessages,
    setPhaseOverride: (v) => state.setPhaseOverride(v),
    runStartIndexRef: recovery.runStartIndexRef,
    resetRecovery: recovery.resetRecovery,
    transcriptLoaded: state.transcriptLoaded,
    setTranscriptLoaded: state.setTranscriptLoaded,
  });

  useRunStartTracking(state.activeRunId, input.onActiveRunChange);
  const startTs = useRunStartTs(state.activeRunId);
  useRunNotification({ agentName: input.agent.name, phase: stream.phase, startTs });
  useStreamingTick({ activeRunId: state.activeRunId, streamPhase: stream.phase });
  useBranchSeed(input.agent.id, input.instanceId, state.transcriptLoaded, state.setPendingSeed);

  const sliceText = useMemo(
    () => sliceRunText(state.thread, recovery.runStartIndexRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runStartIndexRef.current is read imperatively; thread change is the trigger
    [state.thread],
  );
  const phase = deriveChatPhase({
    override: state.phaseOverride,
    summonPending: summon.isPending,
    streamPhase: stream.phase,
    hasSliceText: sliceText.length > 0,
  });
  const isStreaming = isPhaseStreaming(phase);

  const { onSubmit, onAbort, newThread } = useChatActions({
    agentId: input.agent.id,
    projectId: input.projectId,
    instanceId: input.instanceId,
    tKey,
    summon,
    abort,
    sessionId: state.sessionId,
    contextProfile: state.contextProfile,
    phase,
    isStreaming,
    activeRunId: state.activeRunId,
    setActiveRunId: state.setActiveRunId,
    setThread: state.setThread,
    setSessionId: state.setSessionId,
    setPhaseOverride: state.setPhaseOverride,
    setQuotaWarning: state.setQuotaWarning,
    queuedMessages: state.queuedMessages,
    setQueuedMessages: state.setQueuedMessages,
    runStartIndexRef: recovery.runStartIndexRef,
    setRunStartIndex: recovery.setRunStartIndex,
    fallbackAttemptedRef: recovery.fallbackAttemptedRef,
    newThreadSignal: input.newThreadSignal,
  });

  const onCommand = (cmd: string) => {
    if (cmd === "/clear" || cmd === "/branch") { newThread(); return; }
  };

  const liveStats = deriveLiveStats({
    startTs: stream.startTs,
    isActivePhase: phase === "working" || phase === "streaming",
    historyTokens: sumHistoryTokens(state.thread),
    streamTokensIn: stream.usage.tokensIn,
    streamTokensOut: stream.usage.tokensOut,
  });
  const { sinceLastEventMs, isStale } = deriveStreamStaleness(stream.lastEventAt, isStreaming);
  const lastUserMessageText = findLastUserMessageText(state.thread);

  const onContinueRecovered = () => {
    recovery.setRecovered(null);
    state.setPendingSeed(
      "Please continue where you left off. The previous run was interrupted by a server restart - your partial output is in the thread above.",
    );
  };
  const onResummonLastMessage = () => {
    if (!lastUserMessageText) return;
    recovery.setResumeError(null);
    state.setActiveRunId(null);
    state.setPendingSeed(lastUserMessageText);
  };

  // The most recent rate-limit reset time seen in this thread (unix seconds).
  // A hard limit posts a rate-limit card carrying resetsAt even when the run
  // then ends as a generic error — so this is our reset signal for both the
  // rate-limit card AND the error card.
  const lastRateLimitResetsAt = findLastRateLimitResetsAt(state.thread);

  // Schedule a rate-limit auto-resume: when the limit resets, the server fires
  // a run that resumes this session and continues the interrupted work.
  const scheduleResume = async (fireAtMs: number) => {
    const summonRequest = {
      agentId: input.agent.id,
      prompt: "Continue the previous task where you left off — the run was interrupted by a rate limit.",
      projectId: input.projectId,
      instanceId: input.instanceId,
      resumeSessionId: state.sessionId ?? undefined,
    };
    await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fireAt: fireAtMs,
        summonRequest,
        reason: "rate-limit",
        label: `${input.agent.name}: resume after rate limit`,
      }),
    });
    toast(`Resume scheduled for ${formatDateTime(fireAtMs)}`);
  };

  const onScheduleRateLimit = (resetsAtSeconds: number) => scheduleResume(resetsAtSeconds * 1000);

  // Generic entry point for the error/interrupted card: the user picks the
  // exact fire time in the schedule menu, so we just forward it.
  const onScheduleResumeAt = (fireAtMs: number) => scheduleResume(fireAtMs);

  // Best-known limit reset time (ms) to offer as the recommended menu option.
  const resumeResetsAtMs = lastRateLimitResetsAt ? lastRateLimitResetsAt * 1000 : null;

  return {
    tKey,
    projectName,
    state,
    stream,
    recovery,
    phase,
    isStreaming,
    liveStats,
    isStale,
    sinceLastEventMs,
    lastUserMessageText,
    onSubmit,
    onAbort,
    onCommand,
    onNewThread: newThread,
    onContinueRecovered,
    onResummonLastMessage,
    onScheduleRateLimit,
    onScheduleResumeAt,
    resumeResetsAtMs,
    canScheduleResume: lastRateLimitResetsAt != null,
  };
}

/** Most recent rate-limit reset time (unix seconds) seen in the thread. */
function findLastRateLimitResetsAt(thread: ChatState["thread"]): number | undefined {
  for (let i = thread.length - 1; i >= 0; i--) {
    const it = thread[i];
    if (it && it.kind === "system-rate-limit" && it.resetsAt) return it.resetsAt;
  }
  return undefined;
}

/** Fire the parent's active-run change callback whenever activeRunId flips. */
function useRunStartTracking(activeRunId: string | null, onActiveRunChange: ((id: string | null) => void) | undefined): void {
  useEffect(() => {
    onActiveRunChange?.(activeRunId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRunId]);
}

/** Track the wall-clock start-time of the current run so notifications can label it. */
function useRunStartTs(activeRunId: string | null): number | null {
  const ref = useRef<number>(0);
  useEffect(() => {
    if (activeRunId) ref.current = Date.now();
  }, [activeRunId]);
  return ref.current || null;
}

/** Pre-fill composer with the "Branch from here" seed when the transcript loads. */
function useBranchSeed(agentId: string, instanceId: string | undefined, transcriptLoaded: boolean, setPendingSeed: (v: string) => void): void {
  const consumeBranchSeed = useBranchStore((s) => s.consumeSeed);
  useEffect(() => {
    if (!transcriptLoaded) return;
    const branch = consumeBranchSeed(agentId, instanceId);
    if (branch) setPendingSeed(branch.prompt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcriptLoaded, agentId, instanceId]);
}
