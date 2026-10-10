// Pull-request review (the Review Lectern; docs/minecraft-review-lectern.md).

export const REVIEW_ERROR_CODES = [
  "gh_missing",
  "gh_unauthenticated",
  "github_account_missing",
  "not_github_repo",
  "gh_failed",
  "pr_not_found",
  "pr_not_open",
  "review_stale",
  "checks_not_green",
  "pr_conflicting",
  "pr_blocked",
  "invalid_comment_line",
  "seat_not_found",
] as const;
export type ReviewErrorCode = (typeof REVIEW_ERROR_CODES)[number];
export const isReviewErrorCode = (v: unknown): v is ReviewErrorCode =>
  typeof v === "string" && (REVIEW_ERROR_CODES as readonly string[]).includes(v);

/** RULE errors.machine-codes: every code says what fixes it. */
export const REVIEW_ERROR_REMEDIATION: Record<ReviewErrorCode, string> = {
  gh_missing: "Install the GitHub CLI (winget install --id GitHub.cli) and restart Agent Office.",
  gh_unauthenticated: "Run `gh auth login`, or sign the project's GitHub account in again in Settings.",
  github_account_missing: "The project's GitHub account was removed: pick another in the project settings.",
  not_github_repo: "The project folder is not a git checkout with a GitHub remote.",
  gh_failed: "gh failed; the detail has its message. Retry, or check the PR on GitHub.",
  pr_not_found: "The PR does not exist in this project's repo, or this account cannot see it.",
  pr_not_open: "The PR is closed, merged or a draft: refresh the queue.",
  review_stale: "New commits landed since the diff was read: reload the PR and review again.",
  checks_not_green: "Wait for checks to pass, or fix the failing ones, before merging.",
  pr_conflicting: "The branch conflicts with its base: ask the agent to rebase it.",
  pr_blocked: "Branch protection blocks the merge (required reviews or checks): see the PR on GitHub.",
  invalid_comment_line: "A comment points at a line outside the diff, or a range crosses hunks.",
  seat_not_found: "That seat is not in the project's roster.",
};

export const REVIEW_EVENTS = ["REQUEST_CHANGES", "COMMENT", "APPROVE"] as const;
export type ReviewEvent = (typeof REVIEW_EVENTS)[number];

export const DIFF_SIDES = ["LEFT", "RIGHT"] as const;
export type DiffSide = (typeof DIFF_SIDES)[number];

export const PR_LINK_SOURCES = ["recorded", "branch", "manual"] as const;
export type PrLinkSource = (typeof PR_LINK_SOURCES)[number];

/** A diff file past this many lines is cut, and says so. */
export const MAX_DIFF_LINES_PER_FILE = 3000;
export const MAX_REVIEW_COMMENTS = 100;
export const MAX_REVIEW_TEXT = 20_000;
/** Request body cap for review writes: comments × text, with headroom for JSON escaping. */
export const MAX_REVIEW_BODY_BYTES = 4 * 1024 * 1024;
export const MAX_OPEN_PULLS = 50;
