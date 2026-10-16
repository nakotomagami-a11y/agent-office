// What each round ASKS FOR. Content, not control — the dispatcher decides when
// a round runs, this decides what it says.

import type { Finding } from "./loop-machine";

export function authorPrompt(goal: string): string {
  return `Round 1. Work toward this goal:\n${goal}`;
}

export function reviewPrompt(goal: string, round: number, ruleIds: readonly string[]): string {
  return [
    `Review the work just done against this goal:`,
    goal,
    ``,
    `The work is in this working tree: start from \`git status\` and \`git diff\`.`,
    ``,
    `Round ${round}. Report with the ReportFindings tool — NOT as prose. Call it`,
    `once, findings ranked most-severe first, empty array if nothing survives`,
    `verification. A review that reports no verdict is treated as a failed`,
    `review, not as a pass.`,
    ``,
    // Ids inlined rather than pointed at a path: the general.* rules exist in
    // no file, and the list keeps the loop self-contained.
    `Put the rule id in each finding's \`category\` field. This list IS the`,
    `authority: cite nothing else. A finding citing anything outside this list`,
    `rejects the whole batch:`,
    ...ruleIds.map((r) => `  - ${r}`),
  ].join("\n");
}

export function fixPrompt(goal: string, round: number, open: Finding[]): string {
  const list = open
    .map((f) => `- [${f.severity}] ${f.ruleId}${f.file ? ` (${f.file}${f.line ? `:${f.line}` : ""})` : ""}: ${f.why}`)
    .join("\n");
  return [
    `Round ${round}. Fix EXACTLY these findings against the goal:`,
    goal,
    ``,
    list,
    ``,
    `Do not take on unrelated work — an unbounded fix round is how a loop stops converging.`,
  ].join("\n");
}
