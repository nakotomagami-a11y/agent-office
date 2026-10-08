// Pure mapping: a persisted conversation turn (PersistedRun row) → the
// ThreadItem[] shape the existing chat rendering stack (ChatThread /
// MessageBubble) already knows how to draw. A HISTORICAL turn only has what
// was actually persisted — prompt, final output text, pass/fail,
// tokens/cost/duration, and its tool-call trail (Bash/Grep/Read/… — kept for
// 48h, see `PersistedRun.toolCalls`'s doc comment) — not the live
// interleaved thinking timeline or token-by-token streaming (that only ever
// existed in the in-memory SSE event log). The turn that's currently
// active-or-just-resolved still gets the full rich rendering, sourced from
// `useRunStream` exactly as before (see use-conversation-chat-model.ts) —
// this function is only used for turns that have scrolled into history.
import type { PersistedRun } from "@agent-office/domain/types";
import type { ThreadItem } from "./thread-types";
import { formatToolArg, isSubAgentSpawnTool, parseStoredToolInput } from "./tool-item";

export function turnToThreadItems(turn: PersistedRun): ThreadItem[] {
  const items: ThreadItem[] = [{ kind: "you", id: `${turn.id}_you`, text: turn.prompt, origin: turn.origin }];
  // Historical turns get their tool-call trail back from the permanent
  // `tool_calls` table (48h retention). Shaped through the SAME helpers the live
  // path uses — the claim that these "render identically either way" was false:
  // live formatted the arg and dropped sub-agent spawns, this did neither.
  if (turn.toolCalls && turn.toolCalls.length > 0) {
    // A crashed run's calls stay open; its end is the (possibly late) reap time.
    const turnEnd = turn.status === "running" ? undefined : turn.ts + turn.durMs;
    for (const tc of turn.toolCalls) {
      const input = parseStoredToolInput(tc.input);
      // Sub-agent spawns render as their own card, exactly as the live path
      // suppresses them — otherwise a finished run grows duplicate rows.
      if (isSubAgentSpawnTool(tc.name, input)) continue;
      items.push({ kind: "agent-tool", id: tc.id, name: tc.name, arg: formatToolArg(input), runId: turn.id, ts: tc.ts, doneTs: tc.doneTs ?? turnEnd, backgrounded: tc.backgrounded });
    }
  } else if (turn.backgroundTaskCommand) {
    // Fallback for the rare case the tool_calls row already aged out but the
    // conversation row still remembers a backgrounded command (shouldn't
    // normally happen since both come from the same table/window).
    items.push({
      kind: "agent-tool",
      id: `${turn.id}_bg`,
      name: "Bash",
      arg: JSON.stringify({ command: turn.backgroundTaskCommand, run_in_background: true }),
      runId: turn.id,
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
