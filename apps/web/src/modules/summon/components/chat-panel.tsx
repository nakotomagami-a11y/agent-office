"use client";

import { ChatPanelBody } from "./chat-panel-body";
import { useConversationChatModel } from "../hooks/use-conversation-chat-model";
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
 * Server-authoritative: the conversation (turns, queue, session, status) is
 * owned by the server (see docs/chat-refactor.md, `execution/conversation.ts`)
 * — this component and everything below it renders and appends, never
 * reconstructs. All the wiring lives in `useConversationChatModel`; this
 * component just picks the pieces the presentational body needs.
 */
export function ChatPanel({
  agent,
  projectId,
  instanceId,
  noHeader,
  newThreadSignal,
  onActiveRunChange,
}: ChatPanelProps) {
  const m = useConversationChatModel({ agent, projectId, instanceId, newThreadSignal, onActiveRunChange });

  return (
    <ChatPanelBody
      agent={agent}
      projectId={projectId}
      instanceId={instanceId}
      tKey={m.tKey}
      noHeader={noHeader}
      projectName={m.projectName}
      thread={m.thread}
      currentFailureItemId={m.currentFailureItemId}
      activeRunId={m.activeRunId}
      queuedMessages={m.queuedMessages}
      onCancelQueuedMessage={m.onCancelQueuedMessage}
      onDismissThreadItem={m.onDismissThreadItem}
      quotaWarning={m.quotaWarning}
      setQuotaWarning={m.setQuotaWarning}
      contextProfile={m.contextProfile}
      setContextProfile={m.setContextProfile}
      phase={m.phase}
      isStreaming={m.isStreaming}
      liveStats={m.liveStats}
      isStale={m.isStale}
      sinceLastEventMs={m.sinceLastEventMs}
      stream={m.stream}
      onScheduleRateLimit={m.onScheduleRateLimit}
      onScheduleResumeAt={m.onScheduleResumeAt}
      resumeResetsAtMs={m.resumeResetsAtMs}
      canScheduleResume={m.canScheduleResume}
      onSubmit={m.onSubmit}
      onAbort={m.onAbort}
      onCommand={m.onCommand}
      onNewThread={m.onNewThread}
      onRetry={m.onRetry}
      onResume={m.onResume}
      onSkip={m.onSkip}
      pendingSeed={m.pendingSeed}
      setPendingSeed={m.setPendingSeed}
    />
  );
}
