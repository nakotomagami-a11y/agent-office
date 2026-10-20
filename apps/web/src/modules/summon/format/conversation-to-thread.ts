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
import type { PersistedRun, SubRun } from "@agent-office/domain/types";
import type { SubAgentStatus, ThreadItem } from "@agent-office/domain/types";
import { isInterruptionCode } from "@agent-office/domain/config/run-errors";
import { formatToolArg, isSubAgentSpawnTool, parseStoredToolInput } from "./tool-item";

/** A sub-run still "running" under a finished turn was never settled; the live
 *  path's `done`/`error` event settles such cards the same way. */
function subAgentItem(sub: SubRun, turn: PersistedRun): ThreadItem {
  const status: SubAgentStatus = sub.status !== "running" || turn.status === "running" ? sub.status : turn.status;
  return {
    kind: "agent-subagent",
    id: `${sub.id}_sub`,
    name: sub.agentId,
    prompt: sub.prompt,
    status,
    startTs: sub.ts,
    durationMs: sub.status === "running" ? undefined : sub.durMs,
    subRunId: sub.id,
    tokensIn: sub.tokensIn,
    tokensOut: sub.tokensOut,
    cost: sub.cost,
  };
}

/** Each card goes where its spawn call was: before the first call made after it started.
 *  Once the calls are pruned (48 h) the cards still follow the prompt, in order. */
function withSubAgents(tools: Array<ThreadItem & { kind: "agent-tool" }>, turn: PersistedRun): ThreadItem[] {
  const out: ThreadItem[] = [];
  let t = 0;
  for (const sub of turn.subRuns ?? []) {
    while (t < tools.length && (tools[t]!.ts ?? 0) <= sub.ts) out.push(tools[t++]!);
    out.push(subAgentItem(sub, turn));
  }
  return [...out, ...tools.slice(t)];
}

export function turnToThreadItems(turn: PersistedRun): ThreadItem[] {
  const items: ThreadItem[] = [{ kind: "you", id: `${turn.id}_you`, text: turn.prompt, origin: turn.origin, ts: turn.ts }];
  const tools: Array<ThreadItem & { kind: "agent-tool" }> = [];
  // Historical turns get their tool-call trail back from the permanent
  // `tool_calls` table (48h retention). Shaped through the SAME helpers the live
  // path uses — the claim that these "render identically either way" was false:
  // live formatted the arg and dropped sub-agent spawns, this did neither.
  if (turn.toolCalls && turn.toolCalls.length > 0) {
    // A crashed run's calls stay open; its end is the (possibly late) reap time.
    const turnEnd = turn.status === "running" ? undefined : turn.ts + turn.durMs;
    for (const tc of turn.toolCalls) {
      const input = parseStoredToolInput(tc.input);
      // Sub-agent spawns render as their own card (from `subRuns`), exactly as
      // the live path suppresses them — otherwise a finished run grows duplicate rows.
      if (isSubAgentSpawnTool(tc.name, input)) continue;
      tools.push({ kind: "agent-tool", id: tc.id, name: tc.name, arg: formatToolArg(input), runId: turn.id, ts: tc.ts, doneTs: tc.doneTs ?? turnEnd, backgrounded: tc.backgrounded });
    }
  } else if (turn.backgroundTaskCommand) {
    // Fallback for the rare case the tool_calls row already aged out but the
    // conversation row still remembers a backgrounded command (shouldn't
    // normally happen since both come from the same table/window).
    tools.push({
      kind: "agent-tool",
      id: `${turn.id}_bg`,
      name: "Bash",
      arg: JSON.stringify({ command: turn.backgroundTaskCommand, run_in_background: true }),
      runId: turn.id,
    });
  }
  items.push(...withSubAgents(tools, turn));
  if (turn.output && turn.output.trim().length > 0) {
    items.push({ kind: "agent-text", id: `${turn.id}_out`, text: turn.output, streaming: false });
  }
  if (turn.status === "error") {
    // Rows from before error_code was persisted fall back to "unknown".
    const code = turn.errorCode ?? "unknown";
    items.push({
      kind: "system-error",
      id: `${turn.id}_err`,
      code,
      detail: turn.errorDetail,
      interrupted: isInterruptionCode(code) || undefined,
    });
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
