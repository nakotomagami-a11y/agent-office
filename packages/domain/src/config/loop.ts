// The Loop's fixed values: what a reviewer may cite, and what the header's
// "QA loop" toggle starts.

/** Citable in every project. A loop runs in the user's repo, which usually has
 *  no `docs/conventions.md`; without these a real defect has no rule to cite,
 *  and one uncitable finding rejects the whole review. */
export const GENERAL_LOOP_RULES = [
  "general.correctness",
  "general.security",
  "general.error-handling",
  "general.tests",
  "general.performance",
  "general.maintainability",
] as const;
export type GeneralLoopRule = (typeof GENERAL_LOOP_RULES)[number];

/** A turn that called one of these changed files, so it has work to review. */
export const FILE_EDIT_TOOLS = ["Edit", "MultiEdit", "Write", "NotebookEdit"] as const;

export const QA_LOOP_REVIEWER = "qa-code-review";

/** Ceilings for a toggle-started loop. Small on purpose: three review rounds
 *  that still disagree is a decision for the user, not a fourth round. */
export const QA_LOOP_CONFIG = {
  maxRounds: 3,
  budgetUsd: 10,
  wallClockMs: 60 * 60 * 1000,
} as const;
