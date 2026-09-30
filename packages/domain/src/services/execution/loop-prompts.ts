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
    `Round ${round}. Report with the ReportFindings tool — NOT as prose. Call it`,
    `once, findings ranked most-severe first, empty array if nothing survives`,
    `verification. A review that reports no verdict is treated as a failed`,
    `review, not as a pass.`,
    ``,
    // Inlined rather than pointed at a path: the loop runs in the USER's repo,
    // which has no copy of our conventions. Simple, and it keeps the loop
    // self-contained — revisit if rule bodies (not just ids) are ever needed.
    `Put the rule id in each finding's \`category\` field. This list IS the`,
    `authority — do NOT look for a conventions file in the repo, it is not`,
    `there. A finding citing anything outside this list rejects the whole batch:`,
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
