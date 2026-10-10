import assert from "node:assert";
import { test } from "node:test";
import * as db from "../db";
import { ReviewError, classifyGhFailure, failureDetail, runGh } from "./gh";
import { getPull, listPulls } from "./pulls";
import { fake, ghFails, memoryDb, project, standard, view } from "./fake-gh.test.support";

memoryDb();

test("lists open PRs, and says when there are more than it shows", async () => {
  const one = JSON.parse(view()) as unknown;
  const { runner, calls } = fake(() => JSON.stringify([one]));
  const r = await listPulls(project, runner);
  assert.ok(r.ok);
  assert.strictEqual(r.value.truncated, false);
  assert.deepStrictEqual(r.value.pulls[0], {
    number: 7, title: "Add WEEK", url: "https://github.com/Owner/Repo/pull/7", author: "Someone", headRef: "wt/dev-branch",
    baseRef: "main", isDraft: false, additions: 3, deletions: 2, changedFiles: 1, reviewDecision: null, updatedAt: "2026-10-10T00:00:00Z",
  });
  assert.deepStrictEqual(calls[0]?.args.slice(0, 6), ["pr", "list", "--state", "open", "--limit", "51"]);
  const many = await listPulls(project, fake(() => JSON.stringify(Array.from({ length: 51 }, () => one))).runner);
  assert.deepStrictEqual(many.ok && [many.value.pulls.length, many.value.truncated], [50, true]);
});

test("one PR: parsed diff, checks, dated notes without drafts, seat from its worktree branch", async () => {
  const r = await getPull(project, 7, fake(standard({
    statusCheckRollup: [{ status: "COMPLETED", conclusion: "SUCCESS" }, { status: "IN_PROGRESS" }, { state: "FAILURE" }],
  })).runner);
  assert.ok(r.ok);
  const p = r.value;
  assert.deepStrictEqual(p.checks, { total: 3, passing: 1, failing: 1, pending: 1 });
  assert.deepStrictEqual(p.notes.map((n) => n.author), ["me", "rowan"], "the PENDING draft is not a note");
  assert.deepStrictEqual([p.files[0]?.hunks.length, p.diffUnavailable, p.isCrossRepository, p.mergeStateStatus], [2, null, false, "CLEAN"]);
  assert.deepStrictEqual(p.link, { repo: "owner/repo", number: 7, projectId: "office", agentId: "developer", instanceId: "developer-abc", source: "branch" });
});

test("a branch name links only a same-repo PR: a fork can name its branch anything", async () => {
  const named = await getPull(project, 7, fake(standard({ headRefName: "agent/tech-writer-x1-1716800000000" })).runner);
  assert.strictEqual(named.ok && named.value.link?.instanceId, "tech-writer-x1");
  for (const isCrossRepository of [true, null]) {
    const fork = await getPull(project, 7, fake(standard({ headRefName: "agent/tech-writer-x1-1", isCrossRepository })).runner);
    assert.deepStrictEqual(fork.ok && [fork.value.link, fork.value.isCrossRepository], [null, isCrossRepository], String(isCrossRepository));
  }
});

test("a stored link counts only in its own project and while its seat is on the roster", async () => {
  const pr = { repo: "owner/repo", number: 7, agentId: "tech-writer", instanceId: "tech-writer-x1", source: "recorded" as const };
  db.setPrLink({ ...pr, projectId: "elsewhere" });
  let r = await getPull(project, 7, fake(standard({ headRefName: "feature/x" })).runner);
  assert.strictEqual(r.ok && r.value.link, null, "another project's link is not ours");
  db.setPrLink({ ...pr, projectId: "office", instanceId: "gone-seat" });
  r = await getPull(project, 7, fake(standard({ headRefName: "feature/x" })).runner);
  assert.strictEqual(r.ok && r.value.link, null, "a seat that left the roster gets nothing");
  db.setPrLink({ ...pr, projectId: "office" });
  r = await getPull(project, 7, fake(standard({ headRefName: "feature/x" })).runner);
  assert.strictEqual(r.ok && r.value.link?.source, "recorded");
});

test("a recording never undoes a manual pick", () => {
  const base = { repo: "o/r", number: 1, projectId: "office", agentId: "developer", instanceId: "developer-abc" };
  db.setPrLink({ ...base, source: "manual" });
  db.setPrLink({ ...base, instanceId: "tech-writer-x1", source: "recorded" });
  assert.deepStrictEqual([db.getPrLink("o/r", 1)?.instanceId, db.getPrLink("O/R", 1)?.source], ["developer-abc", "manual"]);
});

test("a diff GitHub refuses leaves the PR reviewable, with the reason", async () => {
  const r = await getPull(project, 7, fake((c) => (c.args[1] === "diff" ? ghFails("could not find pull request diff: HTTP 406: Sorry, the diff exceeded the maximum number of lines (20000)") : standard()(c))).runner);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.value.files, []);
  assert.match(r.value.diffUnavailable ?? "", /exceeded the maximum number of lines/);
});

test("gh failures become machine codes, with GitHub's reasons read from the stdout body", async () => {
  assert.strictEqual(classifyGhFailure("To get started with GitHub CLI, please run:  gh auth login"), "gh_unauthenticated");
  assert.strictEqual(classifyGhFailure("gh: Bad credentials (HTTP 401)"), "gh_unauthenticated");
  assert.strictEqual(classifyGhFailure("fatal: not a git repository (or any of the parent directories)"), "not_github_repo");
  assert.strictEqual(classifyGhFailure("GraphQL: Could not resolve to a PullRequest with the number of 99."), "pr_not_found");
  assert.strictEqual(
    failureDetail("gh: Unprocessable Entity (HTTP 422)", '{"message":"Unprocessable Entity","errors":["Can not approve your own pull request"]}'),
    "gh: Unprocessable Entity (HTTP 422) | Can not approve your own pull request",
  );
  assert.strictEqual(
    failureDetail("gh: Validation Failed (HTTP 422)", '{"errors":[{"resource":"PullRequestReviewComment","field":"line","code":"invalid"},{"message":"pull_request_review_thread.line must be part of the diff"}]}'),
    "gh: Validation Failed (HTTP 422) | line invalid; pull_request_review_thread.line must be part of the diff",
  );
  assert.deepStrictEqual(!((await listPulls(project, fake(() => "not json").runner)).ok), true);
  const noCwd = await listPulls({ ...project, meta: { ...project.meta, cwd: undefined } }, fake(() => "[]").runner);
  assert.deepStrictEqual(!noCwd.ok && noCwd.error, "not_github_repo");
  const gone = await listPulls({ ...project, meta: { ...project.meta, githubAccountId: "deleted-account" } }, fake(() => "[]").runner);
  assert.deepStrictEqual(!gone.ok && gone.error, "github_account_missing");
});

test("the real runner: no gh on PATH is gh_missing; an unspawnable argument is gh_failed, not a crash", async () => {
  await assert.rejects(
    runGh({ args: ["--version"], cwd: process.cwd(), env: { PATH: "", Path: "" } }),
    (err: unknown) => err instanceof ReviewError && err.code === "gh_missing",
  );
  await assert.rejects(
    runGh({ args: ["pr", "close", "1", "--comment=a\u0000b"], cwd: process.cwd(), env: { PATH: "", Path: "" } }),
    (err: unknown) => err instanceof ReviewError && err.code === "gh_failed",
  );
});
