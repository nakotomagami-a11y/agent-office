"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAbortRun } from "./use-summon";
import { useRunStream } from "./use-run-stream";
import { useStreamingTick } from "./use-streaming-tick";
import {
  useConversation,
  useEnsureConversation,
  useSendConversationMessage,
  useRetryConversation,
  useResumeConversation,
  useSkipConversation,
  useNewConversationThread,
  useRemoveQueuedMessage,
  useClearConversationQueue,
} from "./use-conversation";
import { turnsToThreadItems, turnToThreadItems } from "../format/conversation-to-thread";
import { findLatestBackgroundTask } from "../components/background-task-indicator";
import { transcriptKey } from "../format/transcript-store";
import { clearDraft } from "../format/draft-store";
import { formatDateTime } from "@/lib/format-date";
import { useProject } from "@/modules/projects/hooks/use-projects";
import { useBranchStore } from "@/lib/branch-store";
import { toast } from "@/lib/toast-store";
import {
  deriveStreamStaleness,
  deriveLiveStats,
} from "../format/derive-live-stats";
import { sumHistoryTokens } from "../format/derive-chat-phase";
import type { OfficeAgent } from "@/modules/office/hooks/use-office-agents";
import type { ChatPhase } from "../components/live-status";
import type { ThreadItem } from "../format/thread-types";
import type { ContextProfile, ConversationView } from "@agent-office/domain/types";

type UseConversationChatModelInput = {
  agent: OfficeAgent;
  projectId: string | undefined;
  instanceId: string | undefined;
  newThreadSignal: number | undefined;
  onActiveRunChange: ((id: string | null) => void) | undefined;
  /** Same "report state up" pattern as `onActiveRunChange` — the primary
   *  "Agent: X" modal renders its own header instead of `ChatHead`'s (see
   *  `background-task-indicator.tsx`'s file header comment), so it needs this
   *  reported up rather than reading it off a `ChatHead`-scoped component. */
  onBackgroundTaskChange?: (task: { id: string; command: string } | null) => void;
};

/**
 * Server-authoritative replacement for the old `useChatPanelModel`. Produces
 * the SAME consumer-facing shape `ChatPanel`/`ChatPanelBody` already render,
 * so the entire presentational stack (ChatThread, MessageBubble, banners…)
 * needed zero changes — only the data source underneath changed. See
 * docs/chat-refactor.md for the full design and the disclosed trade-off
 * (historical turns render without their live tool-call granularity).
 *
 * No client-side splice, no ref index, no queue daemon, no transcript blob:
 * `thread` is derived fresh on every render from the server's `turns` +
 * (for the one active-or-just-resolved turn) the live SSE stream via the
 * UNCHANGED `useRunStream`/run-stream-registry.
 */
export function useConversationChatModel(input: UseConversationChatModelInput) {
  const tKey = transcriptKey(input.agent.id, input.instanceId);
  const projectQ = useProject(input.projectId ?? null);
  const projectName = projectQ.data?.meta.name;

  const convQ = useConversation(input.agent.id, input.instanceId);
  const view: ConversationView | null = convQ.data ?? null;

  const ensureMut = useEnsureConversation();
  const sendMut = useSendConversationMessage();
  const retryMut = useRetryConversation();
  const resumeMut = useResumeConversation();
  const skipMut = useSkipConversation();
  const newThreadMut = useNewConversationThread();
  const removeQueuedMut = useRemoveQueuedMessage();
  const clearQueueMut = useClearConversationQueue();
  const abort = useAbortRun();

  // The turn to render live (not from the plain historical fallback): the
  // actively-streaming run, or — while parked on a failure — the most recent
  // turn, so its error still gets the SSE-classified rich card (auth/rate-
  // limit/worktree copy) instead of the generic historical "unknown" one.
  // `subscribeToRunStream`/`attachEmit` (server) replays a run's full event
  // log for as long as it stays in the in-process live registry (~4h), so
  // this works for "just failed a moment ago", not only "still running".
  const lastTurn = view && view.turns.length > 0 ? view.turns[view.turns.length - 1]! : null;
  const liveTurnId = view?.activeRunId ?? (view?.status === "needs_attention" ? (lastTurn?.id ?? null) : null);
  const stream = useRunStream(liveTurnId);

  // Local, view-only overrides — never sent to the server. Mirrors the old
  // "delete this bubble" / "dismiss this rate-limit warning" affordances,
  // which were cosmetic even in the old client (a WARNING doesn't stop the
  // run either way); the one behavior change is they no longer survive a
  // reload, since there is no longer a client-owned thread array to persist
  // them into. Reset whenever the conversation identity changes.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  useEffect(() => setHiddenIds(new Set()), [view?.id]);
  const hideItem = (id: string) => setHiddenIds((prev) => new Set(prev).add(id));

  // Per-panel ephemeral UI state — never persisted server-side (same as the
  // old model): the composer's pre-fill seed, and the "how much prior context
  // to inject" preference (only matters on the FIRST turn of a fresh session
  // — see StartRunInput.contextProfile's doc comment).
  const [pendingSeed, setPendingSeed] = useState<string | undefined>(undefined);
  const [contextProfile, setContextProfile] = useState<ContextProfile>("balanced");
  const consumeBranchSeed = useBranchStore((s) => s.consumeSeed);
  useEffect(() => {
    const branch = consumeBranchSeed(input.agent.id, input.instanceId);
    if (branch) setPendingSeed(branch.prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per agent/instance identity
  }, [input.agent.id, input.instanceId]);

  const thread: ThreadItem[] = useMemo(() => {
    if (!view) return [];
    const liveTurn = liveTurnId ? (view.turns.find((t) => t.id === liveTurnId) ?? null) : null;
    const historical = liveTurn ? view.turns.filter((t) => t.id !== liveTurn.id) : view.turns;
    const items = turnsToThreadItems(historical);
    if (liveTurn) {
      const liveItems: ThreadItem[] = [];
      const hasLiveContent = stream.thread.length > 0 || stream.phase === "streaming" || stream.phase === "starting";
      if (hasLiveContent) {
        liveItems.push({ kind: "you", id: `${liveTurn.id}_you`, text: liveTurn.prompt });
        liveItems.push(...stream.thread);
      } else {
        liveItems.push(...turnToThreadItems(liveTurn));
      }
      // The server is authoritative: if it reports the conversation as parked,
      // the user MUST have a resolvable failure card to unblock the queue. The
      // live SSE replay does NOT reliably yield a system-error for an
      // interrupted / orphan-reaped run (exit -1, empty output, no persisted
      // error event, dropped from the live registry after a server restart) —
      // without one, `currentFailureItemId` stays null and Retry/Resume/Skip
      // render disabled, stranding the queue forever. Guarantee the live turn
      // carries an error card, but only synthesize when its own slice has none
      // (avoids a duplicate when the stream already emitted one followed by an
      // "Exited" divider).
      if (view.status === "needs_attention" && !liveItems.some((it) => it.kind === "system-error")) {
        liveItems.push({ kind: "system-error", id: `${liveTurn.id}_err`, code: "unknown" });
      }
      items.push(...liveItems);
    } else if (view.status === "needs_attention") {
      // Parked with no turn at all (a run that never spawned) — still resolvable.
      items.push({ kind: "system-error", id: `${view.id}_err`, code: "unknown" });
    }
    return hiddenIds.size > 0 ? items.filter((it) => !hiddenIds.has(it.id)) : items;
  }, [view, liveTurnId, stream.thread, stream.phase, hiddenIds]);

  const queuedMessages = useMemo(() => (view?.queue ?? []).map((m) => ({ id: m.id, text: m.text })), [view]);

  // The one item Retry/Resume/Skip act on — see ChatThread's
  // `currentFailureItemId` doc comment. Only ever the LAST rendered item,
  // and only while the server actually reports the conversation as parked.
  const currentFailureItemId = useMemo(() => {
    if (view?.status !== "needs_attention") return null;
    // The LAST system-error belongs to the current (failed) turn — historical
    // turns' error cards sort before it. Scan from the tail past any trailing
    // "Exited N" / done divider the stream may have appended after the error.
    for (let i = thread.length - 1; i >= 0; i--) {
      if (thread[i]!.kind === "system-error") return thread[i]!.id;
    }
    return null;
  }, [view?.status, thread]);

  // Budget/quota notices: currently unused (no server path sets this yet —
  // kept as a real, settable slot for when a budget-warning feature lands,
  // rather than removing the banner plumbing ChatBanners already has for it).
  const [quotaWarning, setQuotaWarning] = useState<string | null>(null);

  // ── phase / streaming ──────────────────────────────────────────────────
  const isSending = sendMut.isPending || ensureMut.isPending;
  const phase: ChatPhase = useMemo(() => {
    if (isSending) return "sending";
    if (!view) return "idle";
    if (view.status === "idle") return "idle";
    if (view.status === "needs_attention") return "error";
    // status === "running"
    if (stream.phase === "starting") return "connecting";
    if (stream.phase === "streaming") {
      const liveTurn = liveTurnId ? (view.turns.find((t) => t.id === liveTurnId) ?? null) : null;
      const hasText = liveTurn ? stream.thread.some((it) => it.kind === "agent-text" && it.text.length > 0) : false;
      return hasText ? "streaming" : "working";
    }
    if (stream.phase === "done" || stream.phase === "error") return "working"; // transitional — next poll picks up the server's real post-finish state
    return "working";
  }, [isSending, view, stream.phase, stream.thread, liveTurnId]);
  const isStreaming = phase === "sending" || phase === "connecting" || phase === "working" || phase === "streaming";

  const { sinceLastEventMs, isStale } = deriveStreamStaleness(stream.lastEventAt, isStreaming);
  const liveStats = deriveLiveStats({
    startTs: stream.startTs,
    isActivePhase: phase === "working" || phase === "streaming",
    historyTokens: sumHistoryTokens(thread),
    streamTokensIn: stream.usage.tokensIn,
    streamTokensOut: stream.usage.tokensOut,
  });

  useStreamingTick({ activeRunId: view?.activeRunId ?? null, streamPhase: stream.phase });

  useEffect(() => {
    input.onActiveRunChange?.(view?.activeRunId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.activeRunId]);

  useEffect(() => {
    input.onBackgroundTaskChange?.(findLatestBackgroundTask(thread));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread]);

  // ── actions ────────────────────────────────────────────────────────────
  const onSubmit = async (text: string) => {
    try {
      let convId = view?.id;
      if (!convId) {
        const created = await ensureMut.mutateAsync({
          agentId: input.agent.id,
          instanceId: input.instanceId,
          projectId: input.projectId,
        });
        convId = created.id;
      }
      await sendMut.mutateAsync({ conversationId: convId, text, contextProfile });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to send message");
    }
  };

  const onAbort = () => {
    if (!view?.activeRunId) return;
    // No client-side queue clearing: an aborted run parks in needs_attention
    // via the same path as any other failure, preserving the queue (see
    // docs/chat-refactor.md decision #1). Use "Clear queue" to drop it.
    abort.mutate(view.activeRunId);
  };

  const onCommand = (cmd: string) => {
    if (cmd === "/clear" || cmd === "/branch") void onNewThread();
  };

  const onNewThread = async () => {
    void clearDraft(tKey);
    if (view) await newThreadMut.mutateAsync(view.id);
    else await ensureMut.mutateAsync({ agentId: input.agent.id, instanceId: input.instanceId, projectId: input.projectId });
  };
  useNewThreadSignal(input.newThreadSignal, onNewThread);

  const onRetry = () => { if (view) retryMut.mutate(view.id); };
  const onResume = () => { if (view) resumeMut.mutate(view.id); };
  const onSkip = () => { if (view) skipMut.mutate(view.id); };
  const onCancelQueuedMessage = (id: string) => { if (view) removeQueuedMut.mutate({ conversationId: view.id, messageId: id }); };
  const onClearQueue = () => { if (view) clearQueueMut.mutate(view.id); };

  // Rate-limit reset time: the last system-rate-limit item in the CURRENT
  // rendered thread (live only — a warning is transient by nature).
  const lastRateLimitResetsAt = useMemo(() => {
    for (let i = thread.length - 1; i >= 0; i--) {
      const it = thread[i]!;
      if (it.kind === "system-rate-limit" && it.resetsAt) return it.resetsAt;
    }
    return undefined;
  }, [thread]);

  const scheduleResume = async (fireAtMs: number) => {
    const summonRequest = {
      agentId: input.agent.id,
      prompt: "Continue the previous task where you left off — the run was interrupted by a rate limit.",
      projectId: input.projectId,
      instanceId: input.instanceId,
      resumeSessionId: view?.sessionId ?? undefined,
      // Tag the scheduled resume with this conversation so that when it
      // fires, its run's finish is dispatched back into the SAME conversation
      // (auto-advancing its queue / clearing needs_attention) instead of
      // becoming an untracked orphan run.
      conversationId: view?.id,
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
  const onScheduleResumeAt = (fireAtMs: number) => scheduleResume(fireAtMs);

  return {
    tKey,
    projectName,
    view,
    thread,
    queuedMessages,
    onDismissThreadItem: hideItem,
    pendingSeed,
    setPendingSeed,
    contextProfile,
    setContextProfile,
    quotaWarning,
    setQuotaWarning,
    currentFailureItemId,
    phase,
    isStreaming,
    liveStats,
    isStale,
    sinceLastEventMs,
    stream,
    activeRunId: view?.activeRunId ?? null,
    onSubmit,
    onAbort,
    onCommand,
    onNewThread,
    onRetry,
    onResume,
    onSkip,
    onCancelQueuedMessage,
    onClearQueue,
    onScheduleRateLimit,
    onScheduleResumeAt,
    resumeResetsAtMs: lastRateLimitResetsAt ? lastRateLimitResetsAt * 1000 : null,
    canScheduleResume: lastRateLimitResetsAt != null,
  };
}

/** Fires `onNewThread()` whenever the parent-shell `newThreadSignal` changes. */
function useNewThreadSignal(signal: number | undefined, onNewThread: () => void): void {
  const prev = useRef(signal ?? 0);
  useEffect(() => {
    const cur = signal ?? 0;
    if (cur === prev.current) return;
    prev.current = cur;
    void onNewThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on signal change only
  }, [signal]);
}

export type ConversationChatModel = ReturnType<typeof useConversationChatModel>;
