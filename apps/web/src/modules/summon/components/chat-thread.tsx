"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ExpandedStateContext, MessageBubble, ToolGroupRow } from "./message-bubble";
import { LiveStatus, type ChatPhase } from "./live-status";
import { agentDisplayName } from "@/lib/agent-display-name";
import type { ThreadItem } from "../format/thread-types";
import type { OfficeAgent } from "@/modules/office/hooks/use-office-agents";
import { groupRows, isAgentRow, looksLikeQuestion } from "../format/thread-rows";
import { dedupeThread } from "../format/dedupe-thread";

const LIVE_PHASES = new Set<ChatPhase>(["sending", "connecting", "working", "streaming"]);
const CONVERSATIONAL_KINDS = new Set<string>(["you", "agent-text", "system-done", "system-error", "system-rate-limit", "agent-subagent"]);

/** How many items to render at first. The transcript may hold thousands;
 *  rendering the whole list on every token would be a frame-drop nightmare. */
const VISIBLE_WINDOW = 50;
/** How many additional older items to surface when the user clicks "Load
 *  earlier". Tuned so the first paint after a click stays under a frame
 *  budget even on a low-end laptop. */
const LOAD_MORE_STEP = 50;
/** Distance from the bottom (in CSS px) that still counts as "near bottom".
 *  While the user is inside this band, the thread keeps auto-scrolling on
 *  new tokens; once they scroll above it, auto-follow is paused. */
const STICK_THRESHOLD_PX = 80;

export type ChatThreadProps = {
  items: ThreadItem[];
  agent: OfficeAgent;
  onPickSuggestion?: (text: string) => void;
  /** Direct submit - used by inline clarify reply. */
  onSubmit?: (text: string) => void;
  /** Repairs a missing git worktree for the current instance, then auto-retries. */
  onRepairWorktree?: () => Promise<void>;
  /** Abort the active run (Stop button on rate-limit warning). */
  onAbortRun?: () => void;
  /** Dismiss a rate-limit warning card (Continue button). */
  onDismissRateLimit?: (itemId: string) => void;
  /** Delete a user message from the thread (hover action on own messages). */
  onDeleteMessage?: (itemId: string) => void;
  /** Schedule a resume of this session when the limit resets (unix seconds). */
  onScheduleRateLimit?: (resetsAtSeconds: number) => Promise<void>;
  /** Schedule a resume from the error/interrupted card at a user-chosen time (ms). */
  onScheduleResumeAt?: (fireAtMs: number) => Promise<void>;
  /** Known rate-limit reset time (ms), offered as the recommended menu option. */
  resumeResetsAtMs?: number | null;
  /** True when a rate-limit reset time is known for this thread. */
  canScheduleResume?: boolean;
  phase: ChatPhase;
  phaseHint?: string;
  phaseStats?: string;
  /** Messages queued while agent is running - rendered as pending bubbles at the bottom. */
  queuedMessages?: Array<{ id: string; text: string }>;
  onCancelQueuedMessage?: (id: string) => void;
};

const SUGGESTIONS: Array<{ lbl: string; text: string }> = [
  { lbl: "Plan", text: "Help me plan the next change before I start writing code." },
  { lbl: "Review", text: "Look at the current branch and tell me what you'd change before I merge." },
  { lbl: "Inspect", text: "Read ./src and tell me how the code is organised." },
  { lbl: "Explain", text: "Walk me through how this part of the system handles errors." },
];

export function ChatThread({ items: rawItems, agent, onPickSuggestion, onSubmit, onRepairWorktree, onAbortRun, onDismissRateLimit, onDeleteMessage, onScheduleRateLimit, onScheduleResumeAt, resumeResetsAtMs, canScheduleResume, phase, phaseHint, phaseStats, queuedMessages, onCancelQueuedMessage }: ChatThreadProps) {
  // Idempotent guard: collapse a user bubble that was double-added by a
  // resume / queue-drain / recovery effect re-firing (common because the dev
  // server restarts on any server-side edit and the panel replays the active
  // run on remount). Keeps display clean regardless of how the dup got in.
  const items = useMemo(() => dedupeThread(rawItems), [rawItems]);
  const t = useTranslations("chat_thread");
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);

  // Stable map for collapsible section state — survives re-renders and remounts during streaming.
  const expandedMapRef = useRef<Map<string, boolean>>(new Map());
  const expandedCtx = useMemo(() => ({
    get: (id: string) => expandedMapRef.current.get(id) ?? false,
    set: (id: string, val: boolean) => { expandedMapRef.current.set(id, val); },
  }), []);

  // ── Auto-follow state ──
  const [followTail, setFollowTail] = useState(true);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  // visibleCount: number of *rows* (not items) to show. Tool-chain groups count as one row.
  const [visibleCount, setVisibleCount] = useState(VISIBLE_WINDOW);

  // frozenStartRef: when the user scrolls up (!followTail), we lock the
  // start row index so that new items appended at the tail don't shift the
  // slice the user is reading. null = follow-tail mode.
  const frozenStartRef = useRef<number | null>(null);

  // Group ALL items once so chain IDs (chain-${firstTool.id}) are stable for
  // the lifetime of the transcript. Windowing on rows (not items) means a
  // chain that started before the visible window still gets a consistent key,
  // preventing ToolGroupRow from unmounting/remounting mid-stream and losing
  // its expanded state.
  const allRows = useMemo(() => groupRows(items), [items]);

  // Refs so the scroll handler (created once) can read current values.
  const allRowsLengthRef = useRef(allRows.length);
  allRowsLengthRef.current = allRows.length;
  const visibleCountRef = useRef(visibleCount);
  visibleCountRef.current = visibleCount;

  // When the underlying transcript identity changes (agent / instance switch,
  // /clear, /branch), reset state and snap to the bottom.
  const firstId = items[0]?.id ?? null;
  const prevFirstIdRef = useRef(firstId);
  useLayoutEffect(() => {
    if (prevFirstIdRef.current === firstId) return;
    prevFirstIdRef.current = firstId;
    frozenStartRef.current = null;
    setVisibleCount(VISIBLE_WINDOW);
    setFollowTail(true);
    setHasNewBelow(false);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [firstId, items.length]);

  // Window into allRows. While frozen, the start index is fixed — new rows
  // appended at the tail stay outside the visible slice.
  const visibleRows = useMemo(() => {
    const frozen = frozenStartRef.current;
    if (frozen !== null) {
      return allRows.slice(frozen, Math.min(frozen + visibleCount, allRows.length));
    }
    if (visibleCount >= allRows.length) return allRows;
    return allRows.slice(allRows.length - visibleCount);
  // followTail is in deps so the memo re-runs when frozenStartRef changes
  // (frozenStartRef is mutated in the scroll handler then setFollowTail fires).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, visibleCount, followTail]);

  // Count hidden conversational rows (tool chains don't count toward the pill).
  const rowWindowStart = frozenStartRef.current !== null
    ? frozenStartRef.current
    : Math.max(0, allRows.length - visibleCount);
  const hiddenConversationalCount = rowWindowStart > 0
    ? allRows.slice(0, rowWindowStart).filter(
        (row) => row.kind === "single" && CONVERSATIONAL_KINDS.has(row.item.kind)
      ).length
    : 0;

  // Detect agent-text items that are asking a question and haven't been
  // replied to yet. Conditions: any of the last 5 non-empty lines ends with
  // '?', immediately followed by system-done(exit 0), and no 'you' item
  // appears after that system-done.
  const questionIds = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i < items.length - 1; i++) {
      const item = items[i]!;
      const next = items[i + 1]!;
      if (
        item.kind === "agent-text" &&
        !item.streaming &&
        looksLikeQuestion(item.text) &&
        next.kind === "system-done" &&
        next.exitCode === 0 &&
        !items.slice(i + 2).some((it) => it.kind === "you")
      ) {
        ids.add(item.id);
      }
    }
    return ids;
  }, [items]);

  // ── Scroll listener: keep `followTail` in sync with the user's position ──
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        const nearBottom = distance <= STICK_THRESHOLD_PX;
        if (!nearBottom && frozenStartRef.current === null) {
          frozenStartRef.current = Math.max(0, allRowsLengthRef.current - visibleCountRef.current);
        }
        if (nearBottom) {
          frozenStartRef.current = null;
        }
        setFollowTail(nearBottom);
        if (nearBottom) setHasNewBelow(false);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  // ── On mount, snap to the bottom. The modal opens at the latest message,
  //    always - no smooth scroll, no animation, just instantly there. ──
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    frozenStartRef.current = null;
    setFollowTail(true);
    setHasNewBelow(false);
     
  }, []);

  // ── New content effect ──
  // We track the previous item count to distinguish "appended content"
  // (token streamed in, new turn) from "user clicked Load earlier" (item
  // count also rose, but at the top - we must NOT scroll to bottom in that
  // case). When the count rises and the diff matches the bottom of the
  // list, we're in append-mode.
  const prevLenRef = useRef(items.length);
  useEffect(() => {
    const prevLen = prevLenRef.current;
    const nextLen = items.length;
    prevLenRef.current = nextLen;
    if (nextLen <= prevLen) return; // shrinkage or no change → ignore

    const el = scrollRef.current;
    if (!el) return;
    if (followTail) {
      // Stick-to-bottom. Use scrollIntoView on a sentinel so we don't fight
      // with content height changes mid-token.
      bottomAnchorRef.current?.scrollIntoView({ block: "end" });
    } else {
      setHasNewBelow(true);
    }
  }, [items.length, followTail]);

  // ── Load earlier: expand the visible window, preserving scroll anchor ──
  // Naively bumping visibleCount would prepend nodes and yank the viewport
  // upward. We capture scrollHeight before the update and restore the
  // delta after paint so the user's reading position stays put.
  const loadEarlier = useCallback(() => {
    const el = scrollRef.current;
    // When frozen, extend the window backward by moving frozenStart earlier.
    if (frozenStartRef.current !== null) {
      frozenStartRef.current = Math.max(0, frozenStartRef.current - LOAD_MORE_STEP);
    }
    if (!el) {
      setVisibleCount((c) => Math.min(allRowsLengthRef.current, c + LOAD_MORE_STEP));
      return;
    }
    const prevHeight = el.scrollHeight;
    const prevTop = el.scrollTop;
    setVisibleCount((c) => Math.min(allRowsLengthRef.current, c + LOAD_MORE_STEP));
    requestAnimationFrame(() => {
      const nextHeight = el.scrollHeight;
      el.scrollTop = prevTop + (nextHeight - prevHeight);
    });
  }, []);

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setFollowTail(true);
    setHasNewBelow(false);
  }, []);

  return (
    <ExpandedStateContext.Provider value={expandedCtx}>
    <div className="relative min-h-0 flex-1 overflow-hidden flex flex-col">
    <div className="overflow-y-auto overscroll-contain px-[16px] pt-[18px] pb-[20px] flex-1" ref={scrollRef}>
      {items.length === 0 && phase === "idle" ? (
        <div className="text-center flex flex-col gap-[20px] items-center max-w-[760px] mx-auto mt-[60px] px-[24px]">
          <AgentAvatar
            unit={agent.unitChoice}
            size={128}
            label={agent.name}
            className="rounded-none shrink-0"
          />
          <div>
            <h2 className="font-bold mt-[6px] mb-[4px] text-[22px] tracking-[-0.02em]">Hi, I&apos;m {agentDisplayName(agent)}.</h2>
            <p className="text-[var(--txt-3)] m-0 text-[13px]">{agent.description || "Ready when you are - pick a starter or ask anything."}</p>
          </div>
          <div className="flex flex-wrap gap-2 w-full mt-3 [&>*]:basis-[calc(50%-4px)]">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={s.lbl+"sggs_"+ i}
                type="button"
                className="text-left cursor-pointer bg-[var(--bg-1)] border border-[var(--line)] text-[var(--txt-2)] rounded-[12px] px-[14px] py-3 text-[13px] transition-all duration-[120ms] hover:border-[var(--acc)] hover:text-[var(--txt)] hover:-translate-y-px hover:shadow-[var(--shadow-1)]"
                onClick={() => onPickSuggestion?.(s.text)}
              >
                <div className="text-[var(--acc)] uppercase font-semibold text-[10.5px] font-[var(--font-mono)] tracking-[0.06em] mb-1">{s.lbl}</div>
                {s.text}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {hiddenConversationalCount > 0 ? (
            <div className="max-w-[760px] mx-auto mb-3 px-2 flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={loadEarlier}
                aria-label={t("load_earlier_aria", { count: hiddenConversationalCount })}
              >
                <span className="inline-flex rotate-180" aria-hidden>
                  <Icon name="chevron-down" size={12} />
                </span>
                {t("load_earlier", { count: hiddenConversationalCount })}
              </Button>
            </div>
          ) : null}
          <div className="max-w-[760px] mx-auto px-2 flex flex-col gap-[20px]">
            {visibleRows.map((row, idx) => {
              const prevRow = visibleRows[idx - 1] ?? null;
              const curIsAgent = isAgentRow(row);
              const hideAvatar = curIsAgent && prevRow !== null && isAgentRow(prevRow);

              if (row.kind === "single") {
                const isQuestion = questionIds.has(row.item.id);
                const lastYouText = row.item.kind === "system-error" && onSubmit
                  ? (items.slice(0, items.indexOf(row.item)).reverse().find(it => it.kind === "you") as { kind: "you"; text: string } | undefined)?.text
                  : undefined;
                const rlResetsAt = row.item.kind === "system-rate-limit" ? row.item.resetsAt : undefined;
                const wasInterrupted = row.item.kind === "system-error" && row.item.interrupted === true;
                const errLooksLimited =
                  row.item.kind === "system-error" && (canScheduleResume === true || wasInterrupted);
                return (
                  <MessageBubble
                    key={row.item.id + "mbbl_"+idx}
                    item={row.item}
                    agent={agent}
                    isQuestion={isQuestion}
                    hideAvatar={hideAvatar}
                    onReply={isQuestion && onSubmit ? onSubmit : undefined}
                    onRerun={row.item.kind === "you" && onSubmit ? onSubmit : undefined}
                    onDelete={row.item.kind === "you" && onDeleteMessage ? () => onDeleteMessage(row.item.id) : undefined}
                    onRetry={lastYouText ? () => onSubmit!(lastYouText) : undefined}
                    onRepair={
                      onRepairWorktree
                        ? async () => {
                            await onRepairWorktree();
                            if (lastYouText) onSubmit?.(lastYouText);
                          }
                        : undefined
                    }
                    onStopRun={row.item.kind === "system-rate-limit" ? onAbortRun : undefined}
                    onDismissRateLimit={row.item.kind === "system-rate-limit" && onDismissRateLimit ? () => onDismissRateLimit(row.item.id) : undefined}
                    onScheduleRateLimit={
                      rlResetsAt && onScheduleRateLimit ? () => onScheduleRateLimit(rlResetsAt) : undefined
                    }
                    onScheduleResumeAt={errLooksLimited ? onScheduleResumeAt : undefined}
                    resumeResetsAtMs={resumeResetsAtMs}
                  />
                );
              }
              const isTail = idx === visibleRows.length - 1;
              const running = isTail && LIVE_PHASES.has(phase);
              return (
                <ToolGroupRow
                  key={row.id + "tgr_"+idx}
                  id={row.id}
                  tools={row.tools.map((t) => ({ id: t.id, name: t.name, arg: t.arg }))}
                  agent={agent}
                  hideAvatar={hideAvatar}
                  running={running}
                />
              );
            })}
          </div>
          {queuedMessages && queuedMessages.length > 0 ? (
            <div className="max-w-[760px] mx-auto px-2 mt-5 flex flex-col gap-3">
              {queuedMessages.map((q, i) => (
                <div key={q.id + "qm_"+i} className="flex flex-row-reverse ml-auto w-fit max-w-[80%] gap-[12px] relative opacity-[0.55]">
                  <UserAvatar size={60} className="shrink-0" />
                  <div className="flex flex-col items-end gap-[6px]">
                    <div className="bg-ao-bg-3 border border-dashed border-ao-line-1 rounded-[14px_14px_4px_14px] px-4 py-3 text-[14px] leading-[1.55] text-ao-fg-0">{q.text}</div>
                    <div className="flex items-center gap-[6px]">
                      <span className="font-mono text-[10px] tracking-[0.06em] uppercase text-ao-fg-3 bg-ao-bg-3 border border-ao-line-1 rounded-full px-[7px] py-[1px]">
                        queued{queuedMessages.length > 1 ? ` ${i + 1}/${queuedMessages.length}` : ""}
                      </span>
                      <button
                        type="button"
                        className="w-4 h-4 rounded-full bg-transparent border border-ao-line-1 text-ao-fg-3 text-[12px] leading-none cursor-pointer flex items-center justify-center p-0 hover:bg-ao-bg-3 hover:text-ao-fg-1"
                        onClick={() => onCancelQueuedMessage?.(q.id)}
                        aria-label="Cancel queued message"
                      >×</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="max-w-[760px] mx-auto px-2 pb-4 mt-5 flex items-center gap-3">
            <LiveStatus phase={phase} hint={phaseHint} />
            {phaseStats && phase !== "idle" && phase !== "done" && phase !== "aborted" && (
              <span className="font-mono text-[11.5px] text-ao-fg-3 whitespace-nowrap shrink-0">{phaseStats}</span>
            )}
          </div>
          {/* Sentinel for the stick-to-bottom scroll anchor. Lives at the
              very end of the scroll container so scrollIntoView({block:"end"})
              lands precisely where we want, regardless of LiveStatus height. */}
          <div ref={bottomAnchorRef} aria-hidden className="h-px" />
        </>
      )}
    </div>
    {!followTail ? (
      <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none z-[2]" aria-live="polite">
        <button
          type="button"
          className="pointer-events-auto inline-flex items-center gap-[5px] py-[7px] pl-[12px] pr-[14px] rounded-full border border-[var(--line)] bg-[var(--bg-1)] text-[var(--txt)] text-[12px] font-medium tracking-[0.01em] shadow-[var(--shadow-1)] cursor-pointer animate-[jump-pill-in_140ms_ease_both] transition-[color,background,border-color,box-shadow] duration-[100ms] hover:shadow-[var(--shadow-2)] focus-visible:outline-2 focus-visible:outline-[var(--acc)] focus-visible:outline-offset-2"
          data-new={hasNewBelow}
          onClick={jumpToBottom}
          aria-label={t("jump_to_latest_aria")}
        >
          <Icon name="chevron-down" size={14} />
          {hasNewBelow ? t("jump_to_latest") : t("scroll_to_bottom")}
        </button>
      </div>
    ) : null}
    </div>
    </ExpandedStateContext.Provider>
  );
}
