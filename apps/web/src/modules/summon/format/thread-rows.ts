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
