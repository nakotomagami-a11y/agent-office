"use client";

import { ChatHead } from "./chat-head";
import { WorkflowPill } from "./workflow-pill";
import { ChatThread } from "./chat-thread";
import { Composer } from "./composer";
import { ChatBanners } from "./chat-banners";
import { phaseHint } from "../format/phase-format";
import { repairWorktree } from "@/lib/api/roster";
import type { OfficeAgent } from "@/modules/office/hooks/use-office-agents";
import type { ChatPhase } from "./live-status";
import type { ContextProfile } from "@agent-office/domain/types";
import type { ThreadItem } from "../format/thread-types";
import type { QueuedMessage } from "../hooks/use-chat-state";
import type { useRunStream } from "../hooks/use-run-stream";
import type { UseRunRecoveryResult } from "../hooks/use-run-recovery";

type StreamState = ReturnType<typeof useRunStream>;

export type ChatPanelBodyProps = {
  agent: OfficeAgent;
  projectId: string | undefined;
  instanceId: string | undefined;
  tKey: string;
  noHeader: boolean | undefined;
  projectName: string | undefined;
  thread: ThreadItem[];
  setThread: (updater: (prev: ThreadItem[]) => ThreadItem[]) => void;
  activeRunId: string | null;
  pendingSeed: string | undefined;
  setPendingSeed: (v: string | undefined) => void;
  queuedMessages: QueuedMessage[];
  setQueuedMessages: (updater: (prev: QueuedMessage[]) => QueuedMessage[]) => void;
  quotaWarning: string | null;
  setQuotaWarning: (v: string | null) => void;
  contextProfile: ContextProfile;
  setContextProfile: (v: ContextProfile) => void;
  phase: ChatPhase;
  isStreaming: boolean;
  liveStats: string | undefined;
  isStale: boolean;
  sinceLastEventMs: number | null;
  stream: StreamState;
  recovered: UseRunRecoveryResult["recovered"];
  setRecovered: UseRunRecoveryResult["setRecovered"];
  resumeError: UseRunRecoveryResult["resumeError"];
  retryResume: UseRunRecoveryResult["retryResume"];
  dismissResume: UseRunRecoveryResult["dismissResume"];
  lastUserMessageText: string | null;
  onContinueRecovered: () => void;
  onResummonLastMessage: () => void;
  onScheduleRateLimit: (resetsAtSeconds: number) => Promise<void>;
  onScheduleResumeAt: (fireAtMs: number) => Promise<void>;
  resumeResetsAtMs: number | null;
  canScheduleResume: boolean;
  onSubmit: (text: string) => void;
  onAbort: () => void;
  onCommand: (cmd: string) => void;
  onNewThread: () => void;
};

/**
 * Pure presentational body for the ChatPanel — every value is a prop.
 * Nothing derived, nothing async. Splitting this out lets ChatPanel stay
 * focused on state wiring and hook composition.
 */
export function ChatPanelBody(props: ChatPanelBodyProps): React.ReactElement {
  return (
    <div className="flex flex-col min-h-0 h-full flex-1 bg-[var(--bg-1)]" role="region" aria-label={`Chat with ${props.agent.name}`}>
      {!props.noHeader && (
        <ChatHead
          agent={props.agent}
          onNew={props.onNewThread}
          actions={props.activeRunId ? <WorkflowPill runId={props.activeRunId} active={props.isStreaming} /> : null}
        />
      )}

      <ChatBanners
        activeRunId={props.activeRunId}
        recovered={props.recovered}
        setRecovered={props.setRecovered}
        resumeError={props.resumeError}
        retryResume={props.retryResume}
        dismissResume={props.dismissResume}
        stream={props.stream}
        isStale={props.isStale}
        sinceLastEventMs={props.sinceLastEventMs}
        quotaWarning={props.quotaWarning}
        setQuotaWarning={props.setQuotaWarning}
        onContinueRecovered={props.onContinueRecovered}
        onResummonLastMessage={props.onResummonLastMessage}
        lastUserMessageText={props.lastUserMessageText}
      />

      <ChatThread
        items={props.thread}
        agent={props.agent}
        onPickSuggestion={(text) => props.setPendingSeed(text)}
        onSubmit={props.isStreaming ? undefined : props.onSubmit}
        onRepairWorktree={
          props.projectId && props.instanceId
            ? async () => { await repairWorktree(props.projectId!, props.instanceId!); }
            : undefined
        }
        onAbortRun={props.onAbort}
        onDismissRateLimit={(id) => props.setThread((prev) => prev.filter((it) => it.id !== id))}
        onScheduleRateLimit={props.onScheduleRateLimit}
        onScheduleResumeAt={props.onScheduleResumeAt}
        resumeResetsAtMs={props.resumeResetsAtMs}
        canScheduleResume={props.canScheduleResume}
        phase={props.phase}
        phaseHint={phaseHint(props.phase, props.stream.usage)}
        phaseStats={props.liveStats}
        queuedMessages={props.queuedMessages}
        onCancelQueuedMessage={(id) => props.setQueuedMessages((prev) => prev.filter((m) => m.id !== id))}
      />
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
