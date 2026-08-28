"use client";

import { ChatPanelBody } from "./chat-panel-body";
import { useChatPanelModel } from "../hooks/use-chat-panel-model";
import type { OfficeAgent } from "@/modules/office/hooks/use-office-agents";

export type ChatPanelProps = {
  agent: OfficeAgent;
  projectId?: string;
  instanceId?: string;
  onClose: () => void;
  onEdit?: () => void;
  /** When true, skip rendering the ChatHead (it's provided by the parent shell). */
  noHeader?: boolean;
  /** Incrementing this triggers a new thread. */
  newThreadSignal?: number;
  /** Called with the current active run id (null when idle). */
  onActiveRunChange?: (runId: string | null) => void;
};

/**
 * Top-level chat surface.
 *
 * Persistence: per-agent transcript stored server-side via /api/transcripts.
 * On agent change / refresh / modal close, the thread is restored.
 *
 * Reliability: a `runStartIndex` ref marks where the *current* run's
 * output begins in `thread`. The SSE stream's incremental items splice
 * into that slice on every update, so the visible thread is always the
 * single source of truth and the committed items never duplicate the
 * live stream view.
 *
 * Recovery: a stored `activeRunId` is probed once via /api/runs/[id] —
 * if the server still has it live, the SSE re-attach picks it up; if it's
 * already finished, we fall back to the persisted run's output so the user
 * actually sees the result instead of an empty bubble.
 *
 * All the wiring lives in `useChatPanelModel`. This component just picks
 * the pieces the presentational body needs and hands them over.
 */
export function ChatPanel({
  agent,
  projectId,
  instanceId,
  noHeader,
  newThreadSignal,
  onActiveRunChange,
}: ChatPanelProps) {
  const m = useChatPanelModel({ agent, projectId, instanceId, newThreadSignal, onActiveRunChange });

  return (
    <ChatPanelBody
      agent={agent}
      projectId={projectId}
      instanceId={instanceId}
      tKey={m.tKey}
      noHeader={noHeader}
      projectName={m.projectName}
      thread={m.state.thread}
      setThread={m.state.setThread}
      activeRunId={m.state.activeRunId}
      pendingSeed={m.state.pendingSeed}
      setPendingSeed={m.state.setPendingSeed}
      queuedMessages={m.state.queuedMessages}
      setQueuedMessages={m.state.setQueuedMessages}
      quotaWarning={m.state.quotaWarning}
      setQuotaWarning={m.state.setQuotaWarning}
      contextProfile={m.state.contextProfile}
      setContextProfile={m.state.setContextProfile}
      phase={m.phase}
      isStreaming={m.isStreaming}
      liveStats={m.liveStats}
      isStale={m.isStale}
      sinceLastEventMs={m.sinceLastEventMs}
      stream={m.stream}
      recovered={m.recovery.recovered}
      setRecovered={m.recovery.setRecovered}
      resumeError={m.recovery.resumeError}
      retryResume={m.recovery.retryResume}
      dismissResume={m.recovery.dismissResume}
      lastUserMessageText={m.lastUserMessageText}
      onContinueRecovered={m.onContinueRecovered}
      onResummonLastMessage={m.onResummonLastMessage}
      onScheduleRateLimit={m.onScheduleRateLimit}
      onScheduleResumeAt={m.onScheduleResumeAt}
      resumeResetsAtMs={m.resumeResetsAtMs}
      canScheduleResume={m.canScheduleResume}
      onSubmit={m.onSubmit}
      onAbort={m.onAbort}
      onCommand={m.onCommand}
      onNewThread={m.onNewThread}
    />
  );
}
