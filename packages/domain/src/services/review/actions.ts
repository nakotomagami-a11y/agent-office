// Acting on a pull request: submit a review, squash-merge, reject, link it to a seat.
// Every action that changes the PR also tells the linked agent, in its chat. The GitHub
// write comes first; once it has happened nothing after it may turn the result into an error.
import type { ReviewEvent } from "../../config/review";
import type { DiffFile, PrLink, Project, ReviewComment, ReviewSubmission } from "../../types/index";
import * as db from "../db";
import { log } from "../infra/log";
import { sendMessage } from "../execution/conversation";
import { productionConversationRunner } from "../execution/conversation-runner";
import { ReviewError, type GhRunner } from "./gh";
import { mergedMessage, rejectedMessage, reviewMessage, type PrRef } from "./message";
import {
  attempt, checksGreen, ghFor, isFork, readDiff, readPull, repoOf, resolveLink, summarizeChecks,
  type Gh, type GhPull, type ReviewResult,
} from "./pulls";

export interface ReviewDeps {
  runner?: GhRunner;
  send?: typeof sendMessage;
  sleep?: (ms: number) => Promise<void>;
}

export interface ActionOutcome {
  link: PrLink | null;
  /** False when no seat is linked yet (the client asks who gets the feedback) or the send failed. */
  notified: boolean;
  /** merge: the remote branch was deleted. */
  branchDeleted?: boolean;
  /** merge: the repo's merge queue took it; it merges when the queue passes. */
  queued?: boolean;
  /** merge: GitHub reported MERGED afterwards. False with queued false: merged or not, the re-read failed. */
  mergeConfirmed?: boolean;
  /** reject: the reason and line comments reached GitHub. */
  feedbackPosted?: boolean;
}

const ref = (p: GhPull): PrRef =>
  ({ number: p.number, title: p.title, url: p.url, headRef: p.headRefName, baseRef: p.baseRefName });

function assertOpen(p: GhPull, headRefOid: string): void {
  if (p.state !== "OPEN") throw new ReviewError("pr_not_open", p.state);
  if (p.headRefOid !== headRefOid) throw new ReviewError("review_stale", p.headRefOid);
}

/** A comment GitHub would reject: not on a line of this diff on that side, or a range
 *  whose ends are in different hunks ("start_line must be part of the same hunk"). */
export function commentOffDiff(files: DiffFile[], c: ReviewComment): boolean {
  const file = files.find((f) => f.path === c.path);
  if (!file) return true;
  const lineOf = (l: DiffFile["hunks"][number]["lines"][number]) => (c.side === "LEFT" ? l.oldLine : l.newLine);
  const hunk = file.hunks.find((h) => h.lines.some((l) => lineOf(l) === c.line));
  if (!hunk) return true;
  return c.startLine !== undefined && (c.startLine > c.line || !hunk.lines.some((l) => lineOf(l) === c.startLine));
}

function checkComments(files: DiffFile[], comments: ReviewComment[]): void {
  const bad = comments.find((c) => commentOffDiff(files, c));
  if (bad) throw new ReviewError("invalid_comment_line", `${bad.path}:${bad.line}`);
}

const VERDICT: Record<ReviewEvent, string> = { REQUEST_CHANGES: "Changes requested", COMMENT: "Comment", APPROVE: "Approved" };

async function viewerLogin(gh: Gh): Promise<string | null> {
  try {
    return (await gh.run(["api", "user", "--jq", ".login"])).trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

async function postReview(gh: Gh, p: GhPull, event: ReviewEvent, body: string, comments: ReviewComment[]): Promise<void> {
  const post = (ev: ReviewEvent, text: string) => gh.run(
    ["api", `repos/${repoOf(p.url)}/pulls/${p.number}/reviews`, "--method", "POST", "--input", "-"],
    JSON.stringify({
      commit_id: p.headRefOid,
      event: ev,
      body: text,
      comments: comments.map((c) => ({
        path: c.path, body: c.body, line: c.line, side: c.side,
        ...(c.startLine !== undefined && c.startLine !== c.line ? { start_line: c.startLine, start_side: c.side } : {}),
      })),
    }),
  );
  const text = body.trim() || (event === "APPROVE" ? "" : "See the line comments.");
  // Agents push with the user's own account, and GitHub refuses to approve or request
  // changes on your own PR: post the verdict as a comment. The agent still gets it intact.
  const asComment = () => post("COMMENT", `**${VERDICT[event]}** (from Agent Office)\n\n${text}`.trim());
  if (event !== "COMMENT" && (await viewerLogin(gh)) === p.author.toLowerCase()) return void (await asComment());
  try {
    await post(event, text);
  } catch (err) {
    if (!(err instanceof ReviewError) || event === "COMMENT" || !/own pull request/i.test(err.detail)) throw err;
    await asComment();
  }
}

async function notify(link: PrLink | null, text: string, send: typeof sendMessage): Promise<boolean> {
  if (!link) return false;
  try {
    await send(link.agentId, link.instanceId, link.projectId, text, productionConversationRunner, undefined, "system");
    return true;
  } catch (err) {
    log.error("review.notify_failed", { repo: link.repo, number: link.number, err: String(err) });
    return false;
  }
}

const linkOf = (project: Project, p: GhPull) => resolveLink(project, repoOf(p.url), p.number, p.headRefName, isFork(p));

export function submitReview(project: Project, number: number, sub: ReviewSubmission, deps: ReviewDeps = {}): Promise<ReviewResult<ActionOutcome>> {
  const gh = ghFor(project, deps.runner);
  return attempt(async () => {
    const p = await readPull(gh, number);
    assertOpen(p, sub.headRefOid);
    const files = sub.comments.length ? await readDiff(gh, number) : [];
    checkComments(files, sub.comments);
    await postReview(gh, p, sub.event, sub.body, sub.comments);
    const link = linkOf(project, p);
    const notified = await notify(link, reviewMessage(ref(p), sub.event, sub.body, sub.comments, files), deps.send ?? sendMessage);
    return { link, notified };
  });
}

/** Never deleted by Merge, even when one is a PR's head (a backstop to the default-branch check). */
const LONG_LIVED = /^(main|master|trunk|develop|dev|next|stable|staging|prod|production|gh-pages|releases?([/-].*)?|hotfix([/-].*)?)$/i;
const refPath = (branch: string) => branch.split("/").map(encodeURIComponent).join("/");

async function deleteMergedBranch(gh: Gh, p: GhPull): Promise<boolean> {
  if (isFork(p) || LONG_LIVED.test(p.headRefName)) return false;
  try {
    const defaultBranch = (await gh.run(["api", `repos/${repoOf(p.url)}`, "--jq", ".default_branch"])).trim();
    if (!defaultBranch || defaultBranch === p.headRefName) return false;
    // Another open PR built on this branch would lose its base.
    const dependants = await gh.run(["pr", "list", "--state", "open", `--base=${p.headRefName}`, "--json", "number", "--limit", "1"]);
    if (dependants.trim() !== "[]") return false;
    await gh.run(["api", "--method", "DELETE", `repos/${repoOf(p.url)}/git/refs/heads/${refPath(p.headRefName)}`]);
    return true;
  } catch (err) {
    // Also the normal outcome when the repo auto-deletes merged branches.
    log.warn("review.branch_delete_failed", { url: p.url, branch: p.headRefName, err: String(err) });
    return false;
  }
}

export function mergePull(project: Project, number: number, headRefOid: string, deps: ReviewDeps = {}): Promise<ReviewResult<ActionOutcome>> {
  const gh = ghFor(project, deps.runner);
  return attempt(async () => {
    const p = await readPull(gh, number);
    assertOpen(p, headRefOid);
    if (p.isDraft) throw new ReviewError("pr_not_open", "draft");
    const checks = summarizeChecks(p.statusCheckRollup);
    if (!checksGreen(checks)) throw new ReviewError("checks_not_green", `${checks.failing} failing, ${checks.pending} pending`);
    if (p.mergeStateStatus === "DIRTY") throw new ReviewError("pr_conflicting", p.mergeStateStatus);
    if (p.mergeStateStatus === "BLOCKED") throw new ReviewError("pr_blocked", p.mergeStateStatus);
    // --match-head-commit: merge exactly what was reviewed, never a push that landed since.
    // --subject=: the squash commit is titled like the PR (decision 4); `=` because a title may start with "-".
    const link = linkOf(project, p);
    await gh.run(["pr", "merge", String(number), "--squash", "--match-head-commit", headRefOid, `--subject=${p.title} (#${number})`]);
    // GitHub has merged or queued it: from here on nothing may turn the result into an error.
    const state = await settledState(gh, number, deps.sleep ?? delay);
    if (state !== "MERGED") return { link, notified: false, branchDeleted: false, queued: state === "OPEN", mergeConfirmed: false };
    const branchDeleted = await deleteMergedBranch(gh, p);
    const notified = await notify(link, mergedMessage(ref(p), branchDeleted), deps.send ?? sendMessage);
    return { link, notified, branchDeleted, mergeConfirmed: true };
  });
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The PR's state after `gh pr merge` returned: still OPEN after a few reads means a merge queue took it
 *  (a single read can lag a direct merge); null when it cannot be read. */
async function settledState(gh: Gh, number: number, sleep: (ms: number) => Promise<void>): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await readPull(gh, number).then((p) => p.state, () => null);
    if (state !== "OPEN") return state;
    if (attempt < 2) await sleep(1000);
  }
  return "OPEN";
}

export interface Rejection {
  reason: string;
  comments: ReviewComment[];
  headRefOid: string;
}

/** Feedback for a PR that is already closed: a review, else (GitHub refusing reviews on a
 *  closed PR) the same text as a plain comment. Never throws: the close already happened. */
async function postRejectionFeedback(gh: Gh, p: GhPull, r: Rejection): Promise<boolean> {
  const plain = () => gh.run(
    ["api", `repos/${repoOf(p.url)}/issues/${p.number}/comments`, "--method", "POST", "--input", "-"],
    JSON.stringify({ body: [r.reason, ...r.comments.map((c) => `- \`${c.path}:${c.line}\` ${c.body}`)].join("\n\n") }),
  );
  try {
    if (!r.comments.length) await plain();
    else {
      await postReview(gh, p, "COMMENT", r.reason, r.comments).catch((err: unknown) => {
        // Only GitHub refusing a review on the closed PR: after a timeout the review may exist already.
        if (err instanceof ReviewError && /HTTP 422|closed|locked/i.test(err.detail)) return plain();
        throw err;
      });
    }
    return true;
  } catch (err) {
    log.warn("review.reject_feedback_failed", { url: p.url, err: String(err) });
    return false;
  }
}

export function rejectPull(project: Project, number: number, r: Rejection, deps: ReviewDeps = {}): Promise<ReviewResult<ActionOutcome>> {
  const gh = ghFor(project, deps.runner);
  return attempt(async () => {
    const p = await readPull(gh, number);
    assertOpen(p, r.headRefOid);
    const files = r.comments.length ? await readDiff(gh, number) : [];
    checkComments(files, r.comments);
    // Close first: a retry after a failure then stops at pr_not_open instead of posting twice.
    await gh.run(["pr", "close", String(number)]);
    const feedbackPosted = await postRejectionFeedback(gh, p, r);
    const link = linkOf(project, p);
    const notified = await notify(link, rejectedMessage(ref(p), r.reason, r.comments, files), deps.send ?? sendMessage);
    return { link, notified, feedbackPosted };
  });
}

export function linkPull(project: Project, number: number, agentId: string, instanceId: string, deps: ReviewDeps = {}): Promise<ReviewResult<PrLink>> {
  const gh = ghFor(project, deps.runner);
  return attempt(async () => {
    if (!project.meta.roster.some((s) => s.agentId === agentId && s.instanceId === instanceId)) {
      throw new ReviewError("seat_not_found", `${agentId}/${instanceId}`);
    }
    const p = await readPull(gh, number);
    const link: PrLink = { repo: repoOf(p.url), number, projectId: project.id, agentId, instanceId, source: "manual" };
    db.setPrLink(link);
    return link;
  });
}
