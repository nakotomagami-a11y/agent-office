// Pure mapping: a persisted conversation turn (PersistedRun row) → the
// ThreadItem[] shape the existing chat rendering stack (ChatThread /
// MessageBubble) already knows how to draw. This is the one deliberate,
// disclosed trade-off of the server-authoritative refactor (see
// docs/chat-refactor.md): a HISTORICAL turn only has what was actually
// persisted — prompt, final output text, pass/fail, tokens/cost/duration —
// not the live interleaved tool-call/thinking timeline (that only ever
// existed in the in-memory SSE event log). The turn that's currently
// active-or-just-resolved still gets the full rich rendering, sourced from
// `useRunStream` exactly as before (see use-conversation-chat-model.ts) —
// this function is only used for turns that have scrolled into history.
import type { PersistedRun } from "@agent-office/domain/types";
import type { ThreadItem } from "./thread-types";

export function turnToThreadItems(turn: PersistedRun): ThreadItem[] {
  const items: ThreadItem[] = [{ kind: "you", id: `${turn.id}_you`, text: turn.prompt }];
  // The one deliberately-persisted exception to the "no tool trail survives
  // history" rule above: `listConversationTurns` looks this up from
  // `tool_calls` (permanent) rather than the live event log (ephemeral), so
  // a backgrounded command started mid-turn is still visible to
  // `BackgroundTaskIndicator` after the turn itself finishes. Same `arg`
  // shape a live "tool" SSE event would have produced, so it renders
  // identically either way.
  if (turn.backgroundTaskCommand) {
    items.push({
      kind: "agent-tool",
      id: `${turn.id}_bg`,
      name: "Bash",
      arg: JSON.stringify({ command: turn.backgroundTaskCommand, run_in_background: true }),
      ts: turn.backgroundTaskStartedAt,
    });
  }
  if (turn.output && turn.output.trim().length > 0) {
    items.push({ kind: "agent-text", id: `${turn.id}_out`, text: turn.output, streaming: false });
  }
  if (turn.status === "error") {
    // No classified RunErrorCode survives past the live SSE event (it was
    // never persisted per-turn) — "unknown" still renders a working Retry
    // action, just without the specific auth/worktree/rate-limit copy.
    items.push({ kind: "system-error", id: `${turn.id}_err`, code: "unknown" });
  } else if (turn.status === "done") {
    items.push({
      kind: "system-done",
      id: `${turn.id}_done`,
      exitCode: turn.exitCode ?? 0,
      durationMs: turn.durMs,
      tokensIn: turn.tokensIn,
      tokensOut: turn.tokensOut,
      cost: turn.cost,
    });
  }
  // status === "running" here would mean the caller forgot to exclude the
  // live turn — render just the "you" bubble rather than guess at a result.
  return items;
}

export function turnsToThreadItems(turns: PersistedRun[]): ThreadItem[] {
  return turns.flatMap(turnToThreadItems);
}
