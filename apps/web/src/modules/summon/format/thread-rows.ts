// Groups a flat transcript into render rows: consecutive agent-tool calls
// collapse into a single "tool-chain" rail. Pure — no React.

import type { ThreadItem } from "./thread-types";

/** Either a single thread item or a consecutive run of agent-tool calls.
 *  Grouping happens at the thread layer so a chain of tool invocations reads
 *  as one rail with a single avatar, not N independent messages. */
export type RenderRow =
  | { kind: "single"; item: ThreadItem }
  | { kind: "tool-chain"; id: string; tools: Array<Extract<ThreadItem, { kind: "agent-tool" }>> };

export function looksLikeQuestion(text: string): boolean {
  const nonEmpty = text.split("\n").filter((l) => l.trim());
  return nonEmpty.slice(-5).some((l) => l.trimEnd().endsWith("?"));
}

export function isAgentRow(row: RenderRow): boolean {
  if (row.kind === "tool-chain") return true;
  const k = row.item.kind;
  return k === "agent-text" || k === "agent-tool" || k === "agent-thinking" || k === "agent-subagent";
}

export function groupRows(items: ThreadItem[]): RenderRow[] {
  const rows: RenderRow[] = [];
  for (const item of items) {
    const prev = rows[rows.length - 1];
    if (item.kind === "agent-tool" && prev?.kind === "tool-chain") {
      prev.tools.push(item);
      continue;
    }
    if (item.kind === "agent-tool") {
      rows.push({ kind: "tool-chain", id: `chain-${item.id}`, tools: [item] });
      continue;
    }
    rows.push({ kind: "single", item });
  }
  return rows;
}

/** One user ask plus everything the agent did in response to it, up to (but
 *  not including) the next "you". Mirrors how the turn-timeline UI reads a
 *  conversation: one row per ask, with its own cost/token ledger. */
export type Turn = {
  id: string;
  /** null only for stray agent activity that precedes the first "you" in the
   *  visible window (e.g. right after "Load earlier"). */
  ask: Extract<ThreadItem, { kind: "you" }> | null;
  rows: RenderRow[];
  /** From this turn's own `system-done`, if it has finished. */
  ledger: { tokens: number; cost: number; durationMs: number | undefined } | null;
  /** Running total cost through and including this turn. */
  cumulativeCost: number;
  /** Running total tokens (in + out) through and including this turn. */
  cumulativeTokens: number;
};

export function groupTurns(rows: RenderRow[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;

  for (const row of rows) {
    const item = row.kind === "single" ? row.item : null;
    if (item?.kind === "you") {
      if (current) turns.push(current);
      current = { id: `turn-${item.id}`, ask: item, rows: [], ledger: null, cumulativeCost: 0, cumulativeTokens: 0 };
      continue;
    }
    if (!current) current = { id: "turn-lead", ask: null, rows: [], ledger: null, cumulativeCost: 0, cumulativeTokens: 0 };
    current.rows.push(row);
    if (item?.kind === "system-done") {
      current.ledger = { tokens: (item.tokensIn ?? 0) + (item.tokensOut ?? 0), cost: item.cost ?? 0, durationMs: item.durationMs };
    }
  }
  if (current) turns.push(current);

  let runningCost = 0;
  let runningTokens = 0;
  for (const t of turns) {
    if (t.ledger) {
      runningCost += t.ledger.cost;
      runningTokens += t.ledger.tokens;
    }
    t.cumulativeCost = runningCost;
    t.cumulativeTokens = runningTokens;
  }
  return turns;
}
