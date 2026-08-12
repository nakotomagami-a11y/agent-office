import { match } from "ts-pattern";
import type { ChatPhase } from "../components/live-status";
import type { ThreadItem } from "./thread-types";

/**
 * Pure phase-derivation logic shared by the ChatPanel presentation layer.
 * Kept out of the component per CLAUDE.md (business/derivation logic lives
 * in `format/`, components stay presentational).
 */
export function deriveChatPhase(input: {
  override: ChatPhase | null;
  summonPending: boolean;
  streamPhase: "idle" | "starting" | "streaming" | "done" | "error";
  hasSliceText: boolean;
}): ChatPhase {
  if (input.override) return input.override;
  return match({ pending: input.summonPending, streamPhase: input.streamPhase, hasText: input.hasSliceText })
    .when(({ pending }) => pending, () => "sending" as ChatPhase)
    .when(({ streamPhase }) => streamPhase === "starting", () => "connecting" as ChatPhase)
    .when(({ streamPhase, hasText }) => streamPhase === "streaming" && hasText, () => "streaming" as ChatPhase)
    .when(({ streamPhase }) => streamPhase === "streaming", () => "working" as ChatPhase)
    .when(({ streamPhase }) => streamPhase === "done", () => "done" as ChatPhase)
    .when(({ streamPhase }) => streamPhase === "error", () => "error" as ChatPhase)
    .otherwise(() => "idle" as ChatPhase);
}

export function isPhaseStreaming(phase: ChatPhase): boolean {
  return phase === "sending" || phase === "connecting" || phase === "working" || phase === "streaming";
}

/**
 * Sum `tokensIn + tokensOut` across all committed system-done items in the
 * thread. The live stream's usage is added on top by the caller.
 */
export function sumHistoryTokens(thread: ThreadItem[]): number {
  let total = 0;
  for (const item of thread) {
    if (item.kind === "system-done") {
      total += (item.tokensIn ?? 0) + (item.tokensOut ?? 0);
    }
  }
  return total;
}

/**
 * Extract the concatenated agent-text produced during the *current* run
 * (everything since `runStartIndex`). Used by the phase deriver to distinguish
 * "streaming with visible output" from "streaming while thinking".
 */
export function sliceRunText(thread: ThreadItem[], runStartIndex: number | null): string {
  const startIdx = runStartIndex ?? thread.length;
  let out = "";
  for (const item of thread.slice(startIdx)) {
    if (item.kind === "agent-text") out += item.text;
  }
  return out;
}

/**
 * Extract the last "you" message text in the thread — used when the user
 * needs to re-summon a lost run and no server-side prompt is available.
 */
export function findLastUserMessageText(thread: ThreadItem[]): string | null {
  for (let i = thread.length - 1; i >= 0; i--) {
    const item = thread[i];
    if (item && item.kind === "you") return item.text;
  }
  return null;
}
