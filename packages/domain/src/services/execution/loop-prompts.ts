// What each round ASKS FOR. Content, not control — the dispatcher decides when
// a round runs, this decides what it says.

import type { Finding } from "./loop-machine";

export function authorPrompt(goal: string): string {
  return `Round 1. Work toward this goal:\n${goal}`;
}

export function reviewPrompt(goal: string, round: number): string {
  return [
    `Review the work just done against this goal:`,
    goal,
    ``,
    `Round ${round}. Report findings with ReportFindings. Every finding MUST cite a`,
    `ruleId that resolves in docs/conventions.md — a finding with no rule is an`,
    `opinion and the whole batch will be rejected.`,
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
