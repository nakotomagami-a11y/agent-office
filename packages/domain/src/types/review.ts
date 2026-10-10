import type { DiffSide, PrLinkSource, ReviewEvent } from "../config/review";

export type DiffLineKind = "context" | "add" | "del";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  newStart: number;
  /** Text after the second `@@`, usually the enclosing function. */
  section: string;
  lines: DiffLine[];
}

export type DiffFileStatus = "added" | "deleted" | "modified" | "renamed";

export interface DiffFile {
  path: string;
  /** Differs from `path` only for a rename. */
  oldPath: string;
  status: DiffFileStatus;
  binary: boolean;
  additions: number;
  deletions: number;
  /** Lines past MAX_DIFF_LINES_PER_FILE were dropped. */
  truncated: boolean;
  hunks: DiffHunk[];
}

export interface PrChecks {
  total: number;
  passing: number;
  failing: number;
  pending: number;
}

export interface PrLink {
  repo: string;
  number: number;
  projectId: string | null;
  agentId: string;
  instanceId: string;
  source: PrLinkSource;
}

export interface PullSummary {
  number: number;
  title: string;
  url: string;
  author: string;
  headRef: string;
  baseRef: string;
  isDraft: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  reviewDecision: string | null;
  updatedAt: string;
}

export interface PullNote {
  kind: "review" | "comment";
  author: string;
  /** Review state (APPROVED, CHANGES_REQUESTED, COMMENTED), null for a plain comment. */
  state: string | null;
  body: string;
  at: string;
}

export interface PullDetail extends PullSummary {
  repo: string;
  body: string;
  state: string;
  headRefOid: string;
  mergeable: string | null;
  /** GitHub's merge state: CLEAN, BLOCKED, DIRTY (conflicts), BEHIND, UNSTABLE, DRAFT, … */
  mergeStateStatus: string | null;
  /** As gh reported it; null (unknown) is treated as a fork: never linked by branch name, its branch never deleted. */
  isCrossRepository: boolean | null;
  checks: PrChecks;
  notes: PullNote[];
  files: DiffFile[];
  /** Why `files` is empty though the PR changed files (GitHub refuses diffs over 20k lines / 300 files). */
  diffUnavailable: string | null;
  /** Who gets the feedback; null until linked (the client then asks for a seat). */
  link: PrLink | null;
}

export interface PullQueue {
  pulls: PullSummary[];
  /** More open PRs exist than were listed. */
  truncated: boolean;
}

export interface ReviewComment {
  path: string;
  line: number;
  side: DiffSide;
  startLine?: number;
  body: string;
}

export interface ReviewSubmission {
  event: ReviewEvent;
  body: string;
  comments: ReviewComment[];
  /** The head the client reviewed; a newer head means the diff it saw is stale. */
  headRefOid: string;
}
