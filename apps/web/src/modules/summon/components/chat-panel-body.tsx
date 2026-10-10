"use client";

import type { MessageOrigin } from "@agent-office/domain/types";
import { ChatHead } from "./chat-head";
import { WorkflowPill } from "./workflow-pill";
import { PermissionCard } from "./permission-card";
import { usePendingPermissions } from "../hooks/use-pending-permissions";
import { ChatThread } from "./chat-thread";
import { Composer } from "./composer";
import { ChatBanners } from "./chat-banners";
import { BackgroundTaskIndicator } from "./background-task-indicator";
import { phaseHint } from "../format/phase-format";
import { repairWorktree } from "@/lib/api/roster";
import type { LiveStats } from "../format/derive-live-stats";
import type { OfficeAgent } from "@/modules/office/hooks/use-office-agents";
import type { ChatPhase } from "./live-status";
import type { ContextProfile } from "@agent-office/domain/types";
import type { ThreadItem } from "@agent-office/domain/types";
import type { useRunStream } from "../hooks/use-run-stream";

type StreamState = ReturnType<typeof useRunStream>;

export type ChatPanelBodyProps = {
  agent: OfficeAgent;
  projectId: string | undefined;
  instanceId: string | undefined;
  tKey: string;
  noHeader: boolean | undefined;
  projectName: string | undefined;
  thread: ThreadItem[];
  /** The id of the thread's current unresolved failure (see ChatThread's
   *  `currentFailureItemId` doc comment) — null when the conversation isn't
   *  parked on a failure. */
  currentFailureItemId: string | null;
  activeRunId: string | null;
  /** ChatThread reads `origin` to pick a user bubble vs a SystemNotice. */
  queuedMessages: Array<{ id: string; text: string; origin?: MessageOrigin }>;
  onCancelQueuedMessage: (id: string) => void;
  /** Hide a thread item from THIS view only (rate-limit "Continue" dismiss,
   *  own-message delete) — cosmetic, not persisted; see
   *  use-conversation-chat-model.ts's doc comment on why. */
  onDismissThreadItem: (id: string) => void;
  quotaWarning: string | null;
  setQuotaWarning: (v: string | null) => void;
  contextProfile: ContextProfile;
  setContextProfile: (v: ContextProfile) => void;
  phase: ChatPhase;
  isStreaming: boolean;
  liveStats: LiveStats | undefined;
  stream: StreamState;
  onScheduleRateLimit: (resetsAtSeconds: number) => Promise<void>;
  onScheduleResumeAt: (fireAtMs: number) => Promise<void>;
  resumeResetsAtMs: number | null;
  canScheduleResume: boolean;
  onSubmit: (text: string) => void;
  onAbort: () => void;
  onCommand: (cmd: string) => void;
  onNewThread: () => void;
  onRetry: () => void;
  onResume: () => void;
  onSkip: () => void;
  pendingSeed: string | undefined;
  setPendingSeed: (v: string | undefined) => void;
};

/**
 * Pure presentational body for the ChatPanel — every value is a prop.
 * Nothing derived, nothing async. Splitting this out lets ChatPanel stay
 * focused on state wiring and hook composition.
 */
export function ChatPanelBody(props: ChatPanelBodyProps): React.ReactElement {
  // Parked approvals block the run — render them above the composer.
  const { pending, decide } = usePendingPermissions(props.activeRunId, props.isStreaming);
  return (
    <div className="flex flex-col min-h-0 h-full flex-1 bg-[var(--bg-1)]" role="region" aria-label={`Chat with ${props.agent.name}`}>
      {!props.noHeader && (
        <ChatHead
          agent={props.agent}
          onNew={props.onNewThread}
          actions={
            <>
              <BackgroundTaskIndicator thread={props.thread} resetKey={props.tKey} />
              {props.activeRunId ? <WorkflowPill runId={props.activeRunId} active={props.isStreaming} /> : null}
            </>
          }
        />
      )}

      <ChatBanners
        stream={props.stream}
        quotaWarning={props.quotaWarning}
        setQuotaWarning={props.setQuotaWarning}
      />

      <ChatThread
        items={props.thread}
        agent={props.agent}
        projectId={props.projectId}
        onPickSuggestion={(text) => props.setPendingSeed(text)}
        onSubmit={props.isStreaming ? undefined : props.onSubmit}
        onRepairWorktree={
          props.projectId && props.instanceId
            ? async () => { await repairWorktree(props.projectId!, props.instanceId!); }
            : undefined
        }
        onAbortRun={props.onAbort}
        onDismissRateLimit={(id) => props.onDismissThreadItem(id)}
        onDeleteMessage={(id) => props.onDismissThreadItem(id)}
        onScheduleRateLimit={props.onScheduleRateLimit}
        onScheduleResumeAt={props.onScheduleResumeAt}
        resumeResetsAtMs={props.resumeResetsAtMs}
        canScheduleResume={props.canScheduleResume}
        currentFailureItemId={props.currentFailureItemId}
        onRetryFailedTurn={props.onRetry}
        onResumeFailedTurn={props.onResume}
        onSkipFailedTurn={props.onSkip}
        phase={props.phase}
        phaseHint={phaseHint(props.phase, props.stream.usage)}
        phaseStats={props.liveStats}
        queuedMessages={props.queuedMessages}
        onCancelQueuedMessage={props.onCancelQueuedMessage}
      />
      {pending.length > 0 && (
        <div className="flex flex-col gap-2 px-4 pb-2 shrink-0">
          {pending.map((req) => (
            <PermissionCard key={req.id} request={req} onDecide={decide} />
          ))}
        </div>
      )}
      {/* key=tKey forces a fresh Composer mount whenever the agent or
          instance changes, ensuring useState re-initialises from the correct
          draft slot rather than showing the previous agent's text. */}
      <Composer
        key={props.tKey}
        onSubmit={props.onSubmit}
        abortable={props.isStreaming && props.activeRunId !== null}
        onAbort={props.onAbort}
        agentId={props.agent.id}
        projectId={props.projectId}
        modelChip={props.agent.defaultModel ?? "default"}
        cwdChip={props.projectName ? `project: ${props.projectName}` : props.projectId ? `project: ${props.projectId}` : undefined}
        seed={props.pendingSeed}
        onSeedConsumed={() => props.setPendingSeed(undefined)}
        onCommand={props.onCommand}
        draftKey={props.tKey}
        contextProfile={props.contextProfile}
        onProfileChange={props.setContextProfile}
      />
    </div>
  );
}
