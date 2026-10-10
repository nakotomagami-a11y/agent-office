// Reading pull requests: the open queue, and one PR with its parsed diff, checks, notes and agent link.
import { z } from "zod";
import { MAX_OPEN_PULLS, type ReviewErrorCode } from "../../config/review";
import type { AgentInstance, DiffFile, PrChecks, PrLink, Project, PullDetail, PullNote, PullQueue, PullSummary } from "../../types/index";
import * as db from "../db";
import { parseUnifiedDiff } from "./diff";
import { ReviewError, ghEnv, runGh, type GhRunner } from "./gh";

export type ReviewResult<T> = { ok: true; value: T } | { ok: false; error: ReviewErrorCode; status: number; detail?: string };

const STATUS: Record<ReviewErrorCode, number> = {
  gh_missing: 503,
  gh_unauthenticated: 503,
  github_account_missing: 409,
  not_github_repo: 409,
  gh_failed: 502,
  pr_not_found: 404,
  pr_not_open: 409,
  review_stale: 409,
  checks_not_green: 409,
  pr_conflicting: 409,
  pr_blocked: 409,
  invalid_comment_line: 400,
  seat_not_found: 404,
};

export const fail = <T>(error: ReviewErrorCode, detail?: string): ReviewResult<T> =>
  ({ ok: false, error, status: STATUS[error], detail });

/** ReviewError → a result, and so is gh output we cannot parse (a gh upgrade); anything else is a bug. */
export async function attempt<T>(fn: () => Promise<T>): Promise<ReviewResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (err instanceof ReviewError) return fail(err.code, err.detail);
    if (err instanceof z.ZodError || err instanceof SyntaxError) return fail("gh_failed", "unexpected gh output");
    throw err;
  }
}

export interface Gh {
  project: Project;
  run: (args: string[], input?: string) => Promise<string>;
}

export function ghFor(project: Project, runner: GhRunner = runGh): Gh {
  const cwd = project.meta.cwd;
  return {
    project,
    // Env per call, inside the caller's attempt(): a removed GitHub account is a code, not a crash.
    run: async (args, input) => {
      if (!cwd) throw new ReviewError("not_github_repo", "project has no cwd");
      return runner({ args, cwd, env: ghEnv(project), input });
    },
  };
}

const login = z.object({ login: z.string() }).nullish().transform((a) => a?.login ?? "ghost");

const summaryShape = {
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  author: login,
  headRefName: z.string(),
  baseRefName: z.string(),
  isDraft: z.boolean(),
  additions: z.number(),
  deletions: z.number(),
  changedFiles: z.number(),
  reviewDecision: z.string().nullish(),
  updatedAt: z.string(),
};
const LIST_FIELDS = Object.keys(summaryShape).join(",");

const check = z.object({ status: z.string().nullish(), conclusion: z.string().nullish(), state: z.string().nullish() });
const detailShape = z.object({
  ...summaryShape,
  body: z.string().nullish(),
  state: z.string(),
  headRefOid: z.string(),
  mergeable: z.string().nullish(),
  mergeStateStatus: z.string().nullish(),
  isCrossRepository: z.boolean().nullish(),
  statusCheckRollup: z.array(check).nullish(),
  reviews: z.array(z.object({ author: login, state: z.string(), body: z.string().nullish(), submittedAt: z.string().nullish() })).nullish(),
  comments: z.array(z.object({ author: login, body: z.string().nullish(), createdAt: z.string() })).nullish(),
});
const DETAIL_FIELDS = Object.keys(detailShape.shape).join(",");
export type GhPull = z.infer<typeof detailShape>;

function toSummary(p: z.infer<z.ZodObject<typeof summaryShape>>): PullSummary {
  return {
    number: p.number, title: p.title, url: p.url, author: p.author,
    headRef: p.headRefName, baseRef: p.baseRefName, isDraft: p.isDraft,
    additions: p.additions, deletions: p.deletions, changedFiles: p.changedFiles,
    reviewDecision: p.reviewDecision ?? null, updatedAt: p.updatedAt,
  };
}

const PASS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);

/** CheckRuns report status + conclusion, legacy commit statuses report state. */
export function summarizeChecks(rollup: z.infer<typeof check>[] | null | undefined): PrChecks {
  const out = { total: 0, passing: 0, failing: 0, pending: 0 };
  for (const c of rollup ?? []) {
    out.total++;
    const done = c.state ? c.state !== "PENDING" && c.state !== "EXPECTED" : c.status === "COMPLETED";
    const verdict = c.state ?? c.conclusion ?? "";
    if (!done) out.pending++;
    else if (PASS.has(verdict)) out.passing++;
    else out.failing++;
  }
  return out;
}

export const checksGreen = (c: PrChecks) => c.failing === 0 && c.pending === 0;

export function repoOf(url: string): string {
  const m = /github\.com\/([^/]+\/[^/]+)\/pull\/\d+/i.exec(url);
  if (!m?.[1]) throw new ReviewError("not_github_repo", url);
  return m[1].toLowerCase();
}

function notesOf(p: GhPull): PullNote[] {
  // PENDING = the viewer's own unsubmitted draft review: not a note, and it has no date.
  const reviews: PullNote[] = (p.reviews ?? []).filter((r) => r.state !== "PENDING").map((r) =>
    ({ kind: "review", author: r.author, state: r.state, body: r.body ?? "", at: r.submittedAt ?? "" }));
  const comments: PullNote[] = (p.comments ?? []).map((c) =>
    ({ kind: "comment", author: c.author, state: null, body: c.body ?? "", at: c.createdAt }));
  return [...reviews, ...comments].filter((n) => n.body.trim() || n.state === "APPROVED").sort((a, b) => a.at.localeCompare(b.at));
}

/** The seat whose worktree is this branch, else the one named in an `agent/<instanceId>-<ts>` branch. */
export function seatForBranch(roster: AgentInstance[], headRef: string): AgentInstance | null {
  const exact = roster.find((s) => s.worktree?.branch === headRef);
  if (exact) return exact;
  const m = /^agent\/(.+)-\d+$/.exec(headRef);
  return (m && roster.find((s) => s.instanceId === m[1])) || null;
}

/** A fork's PR (or one gh cannot vouch for) is never "ours" by branch name: anyone can name a fork branch. */
export const isFork = (p: GhPull) => p.isCrossRepository !== false;

const onRoster = (project: Project, l: PrLink) =>
  project.meta.roster.some((s) => s.agentId === l.agentId && s.instanceId === l.instanceId);

/** Stored links count only inside their own project and while their seat is still on the roster. */
export function resolveLink(project: Project, repo: string, number: number, headRef: string, fork: boolean): PrLink | null {
  const stored = db.getPrLink(repo, number);
  if (stored && stored.projectId === project.id && onRoster(project, stored)) return stored;
  if (fork) return null;
  const seat = seatForBranch(project.meta.roster, headRef);
  return seat
    ? { repo, number, projectId: project.id, agentId: seat.agentId, instanceId: seat.instanceId, source: "branch" }
    : null;
}

export async function readPull(gh: Gh, number: number): Promise<GhPull> {
  const raw = await gh.run(["pr", "view", String(number), "--json", DETAIL_FIELDS]);
  return detailShape.parse(JSON.parse(raw) as unknown);
}

export async function readDiff(gh: Gh, number: number) {
  return parseUnifiedDiff(await gh.run(["pr", "diff", String(number)]));
}

export function listPulls(project: Project, runner?: GhRunner): Promise<ReviewResult<PullQueue>> {
  const gh = ghFor(project, runner);
  return attempt(async () => {
    const raw = await gh.run(["pr", "list", "--state", "open", "--limit", String(MAX_OPEN_PULLS + 1), "--json", LIST_FIELDS]);
    const pulls = z.array(z.object(summaryShape)).parse(JSON.parse(raw) as unknown).map(toSummary);
    return { pulls: pulls.slice(0, MAX_OPEN_PULLS), truncated: pulls.length > MAX_OPEN_PULLS };
  });
}

export function getPull(project: Project, number: number, runner?: GhRunner): Promise<ReviewResult<PullDetail>> {
  const gh = ghFor(project, runner);
  return attempt(async () => {
    const p = await readPull(gh, number);
    // GitHub refuses diffs past 20k lines / 300 files; the PR can still be merged or rejected.
    let files: DiffFile[] = [];
    let diffUnavailable: string | null = null;
    try {
      files = await readDiff(gh, number);
    } catch (err) {
      if (!(err instanceof ReviewError)) throw err;
      diffUnavailable = err.code === "gh_failed" ? err.detail : err.code;
    }
    const repo = repoOf(p.url);
    return {
      ...toSummary(p),
      repo,
      body: p.body ?? "",
      state: p.state,
      headRefOid: p.headRefOid,
      mergeable: p.mergeable ?? null,
      mergeStateStatus: p.mergeStateStatus ?? null,
      isCrossRepository: p.isCrossRepository ?? null,
      checks: summarizeChecks(p.statusCheckRollup),
      notes: notesOf(p),
      files,
      diffUnavailable,
      link: resolveLink(project, repo, number, p.headRefName, isFork(p)),
    };
  });
}
