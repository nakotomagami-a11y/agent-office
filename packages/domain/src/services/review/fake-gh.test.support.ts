// Shared by the review tests: a project, a PR as `gh pr view --json` prints it, and a gh
// runner that answers like gh does (errors on stderr, GitHub's reasons in the stdout body).
import Database from "better-sqlite3";
import { z } from "zod";
import { createSchema } from "../db/migrations";
import type { Project, ReviewComment } from "../../types/index";
import { ReviewError, failureDetail, classifyGhFailure, type GhCall, type GhRunner } from "./gh";
import type { ReviewDeps } from "./actions";

export function memoryDb(): void {
  const mem = new Database(":memory:");
  createSchema(mem);
  globalThis.__agentOfficeDb = mem;
}

export const SHA = "a".repeat(40);

export const project: Project = {
  id: "office",
  memory: "",
  meta: {
    name: "Office",
    description: "",
    cwd: "/repo",
    roster: [
      { agentId: "developer", instanceId: "developer-abc", worktree: { branch: "wt/dev-branch", basePath: "/repo/.worktrees/developer-abc", createdAt: 1 } },
      { agentId: "tech-writer", instanceId: "tech-writer-x1" },
    ],
  },
};

export const DIFF = `diff --git a/src/format.ts b/src/format.ts
--- a/src/format.ts
+++ b/src/format.ts
@@ -5,3 +5,4 @@
 const HOUR = 60 * MINUTE;
-const DAY = 24 * HOUR;
+const DAY = 24 * HOUR; // ms
+const WEEK = 7 * DAY;
 export {};
@@ -40,2 +41,2 @@ function later() {
-  return 1;
+  return 2;
 }
`;

export function view(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    number: 7, title: "Add WEEK", url: "https://github.com/Owner/Repo/pull/7", author: { login: "Someone" },
    headRefName: "wt/dev-branch", baseRefName: "main", isDraft: false, additions: 3, deletions: 2, changedFiles: 1,
    reviewDecision: null, updatedAt: "2026-10-10T00:00:00Z", body: "Adds WEEK.", state: "OPEN", headRefOid: SHA,
    mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", isCrossRepository: false,
    statusCheckRollup: [{ status: "COMPLETED", conclusion: "SUCCESS" }, { state: "SUCCESS" }],
    reviews: [
      { author: { login: "rowan" }, state: "COMMENTED", body: "looks fine", submittedAt: "2026-10-10T00:02:00Z" },
      { author: { login: "me" }, state: "PENDING", body: "draft", submittedAt: null },
    ],
    comments: [{ author: { login: "me" }, body: "ping", createdAt: "2026-10-10T00:01:00Z" }],
    ...over,
  });
}

/** What gh does on a non-zero exit, so tests exercise the real classification path. */
export function ghFails(stderr: string, stdout = ""): never {
  const detail = failureDetail(stderr, stdout);
  throw new ReviewError(classifyGhFailure(detail), detail);
}

export interface Fake { runner: GhRunner; calls: GhCall[] }

export function fake(answer: (c: GhCall) => string): Fake {
  const calls: GhCall[] = [];
  return { calls, runner: async (c) => { calls.push(c); return answer(c); } };
}

export interface StandardOpts {
  viewer?: string;
  /** What each `pr view` after `pr merge` reports: a state, or "FAIL" for a failed read. Default: MERGED. */
  afterMerge?: string[];
  defaultBranch?: string;
}

/** gh for one open PR. */
export function standard(over: Record<string, unknown> = {}, opts: StandardOpts = {}) {
  let after: string[] | null = null;
  return (c: GhCall): string => {
    const [a, b] = c.args;
    if (a === "pr" && b === "view") {
      if (!after) return view(over);
      const state = after.length > 1 ? after.shift()! : (after[0] ?? "MERGED");
      return state === "FAIL" ? ghFails("gh: HTTP 502 Bad Gateway") : view({ ...over, state });
    }
    if (a === "pr" && b === "diff") return DIFF;
    if (a === "pr" && b === "list") return "[]";
    if (a === "pr" && b === "merge") { after = [...(opts.afterMerge ?? ["MERGED"])]; return ""; }
    if (a === "api" && b === "user") return `${opts.viewer ?? "reviewer"}\n`;
    if (a === "api" && c.args.includes(".default_branch")) return `${opts.defaultBranch ?? "main"}\n`;
    return "{}";
  };
}

export const noSleep = async () => {};

export const posted = (c: GhCall) =>
  z.object({ event: z.string().optional(), body: z.string() }).passthrough().parse(JSON.parse(c.input ?? "{}") as unknown);

export function sends() {
  const sent: unknown[][] = [];
  const send = (async (...args: unknown[]) => { sent.push(args); return {}; }) as unknown as NonNullable<ReviewDeps["send"]>;
  return { sent, send };
}

export const comment = (over: Partial<ReviewComment> = {}): ReviewComment =>
  ({ path: "src/format.ts", line: 7, side: "RIGHT", body: "Name it WEEK_MS.", ...over });
