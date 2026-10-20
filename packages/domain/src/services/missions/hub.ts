// The hub: a draft PR whose comments carry the mission (docs/missions.md). Calls run as the
// project's gh identity (review/pulls ghFor) and throw ReviewError.
import { z } from "zod";
import { MISSION_ID, MISSION_LABEL } from "../../config/missions";
import * as db from "../db";
import { ReviewError } from "../review/gh";
import type { Gh } from "../review/pulls";
import type { CommentCursor } from "../../types/index";
import type { HubComment } from "./state";
import { formatPost, type Envelope } from "./envelope";

// gh fills these from the project's git remote (ghEnv strips GH_REPO, so it is always that repo).
const REPO = "repos/{owner}/{repo}";

export interface FetchedComment extends HubComment {
  at: string;
}

const fetched = z.object({ id: z.number().int().positive(), author: z.string(), body: z.string().nullable(), at: z.string(), updated: z.string() });

/** GitHub stamps to the second: a comment from the cursor's own second must not slip past `since`.
 *  The id filter drops the overlap. */
const SINCE_MARGIN_MS = 60_000;

/** Comments after `cursor`, oldest first. `since` is by UPDATE time, so it also returns old
 *  comments edited since (every seat's status comment is edited in place): the id decides. */
export async function listComments(gh: Gh, pr: number, cursor: CommentCursor | null): Promise<FetchedComment[]> {
  const since = cursor ? new Date(Date.parse(cursor.at) - SINCE_MARGIN_MS).toISOString() : null;
  const query = since ? `&since=${encodeURIComponent(since)}` : "";
  const raw = await gh.run([
    "api", "--paginate", `${REPO}/issues/${pr}/comments?per_page=100${query}`,
    "--jq", '.[] | {id, author: (.user.login // "ghost"), body, at: .created_at, updated: .updated_at} | @json',
  ]);
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => fetched.parse(JSON.parse(l) as unknown))
    .map((c) => ({ id: c.id, author: c.author, body: c.body ?? "", at: c.at, edited: c.updated !== c.at }))
    .filter((c) => !cursor || c.id > cursor.id)
    .sort((a, b) => a.id - b.id);
}

const created = z.object({ id: z.number().int().positive(), created_at: z.string() });

export async function postComment(gh: Gh, pr: number, body: string): Promise<CommentCursor> {
  const raw = await gh.run(["api", `${REPO}/issues/${pr}/comments`, "--method", "POST", "--input", "-"], JSON.stringify({ body }));
  const c = created.parse(JSON.parse(raw) as unknown);
  return { id: c.id, at: c.created_at };
}

/** Every mission post this device makes goes through here, so the fold can tell this device's real
 *  posts from forgeries of it (state.ts `forged_self`). The log is written AHEAD: a nonce in the
 *  envelope first, the comment id after, so a lost answer from GitHub does not make our own post
 *  look forged. */
export async function postEnvelope(gh: Gh, pr: number, header: string, text: string, env: Envelope): Promise<{ ok: true; cursor: CommentCursor } | { ok: false; reason: string }> {
  const nonce = db.reserveMissionPost(env.m);
  const made = formatPost(header, text, { ...env, data: { ...env.data, n: nonce } });
  if (!made.ok) return { ok: false, reason: made.reason };
  const cursor = await postComment(gh, pr, made.body);
  db.confirmMissionPost(env.m, nonce, cursor.id);
  return { ok: true, cursor };
}

export async function editComment(gh: Gh, commentId: number, body: string): Promise<void> {
  await gh.run(["api", `${REPO}/issues/comments/${commentId}`, "--method", "PATCH", "--input", "-"], JSON.stringify({ body }));
}

export async function editPullBody(gh: Gh, pr: number, body: string): Promise<void> {
  await gh.run(["api", `${REPO}/pulls/${pr}`, "--method", "PATCH", "--input", "-"], JSON.stringify({ body }));
}

const isMissing = (err: unknown) => err instanceof ReviewError && /HTTP (404|422)/.test(err.detail);
// Both go into an API path: `..` or `?` would address a different endpoint. A name outside
// these cannot exist on the remote anyway.
const SAFE_BRANCH = /^(?!.*\.\.)[A-Za-z0-9._/-]{1,255}$/;
const SHA = /^[0-9a-f]{7,40}$/;

export async function remoteHasBranch(gh: Gh, branch: string): Promise<boolean> {
  if (!SAFE_BRANCH.test(branch) || branch.startsWith("/")) return false;
  try {
    await gh.run(["api", `${REPO}/git/ref/heads/${branch}`, "--jq", ".object.sha"]);
    return true;
  } catch (err) {
    if (isMissing(err)) return false;
    throw err;
  }
}

export async function remoteHasCommit(gh: Gh, sha: string): Promise<boolean> {
  if (!SHA.test(sha)) return false;
  try {
    await gh.run(["api", `${REPO}/commits/${sha}`, "--jq", ".sha"]);
    return true;
  } catch (err) {
    if (isMissing(err)) return false;
    throw err;
  }
}

export interface HubPull {
  number: number;
  title: string;
  url: string;
  headRefName: string;
  isDraft: boolean;
  body: string;
}

const hubPull = z.object({
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  headRefName: z.string(),
  isDraft: z.boolean(),
  body: z.string().nullable(),
});

export async function getHub(gh: Gh, pr: number): Promise<HubPull & { state: string; isCrossRepository: boolean }> {
  const raw = await gh.run(["pr", "view", String(pr), "--json", "number,title,url,headRefName,isDraft,body,state,isCrossRepository"]);
  const p = hubPull.extend({ state: z.string(), isCrossRepository: z.boolean().nullish() }).parse(JSON.parse(raw) as unknown);
  return { ...p, body: p.body ?? "", isCrossRepository: p.isCrossRepository ?? false };
}

/** A start that failed half way: close the hub and drop its branch, so no lead-less PR is left. */
export async function abandonHub(gh: Gh, pr: number): Promise<void> {
  await gh.run(["pr", "close", String(pr), "--delete-branch", "--comment", "Mission start failed; closed by Agent Office."]).catch(() => undefined);
}

/** The account this project posts as: with one account for human and agents (D5), the only
 *  author whose comments count. */
export async function hubLogin(gh: Gh): Promise<string> {
  const login = (await gh.run(["api", "user", "--jq", ".login"])).trim();
  if (!/^[A-Za-z0-9-]{1,39}$/.test(login)) throw new ReviewError("gh_failed", "gh api user printed no login");
  return login;
}

export async function listHubs(gh: Gh): Promise<HubPull[]> {
  const raw = await gh.run([
    "pr", "list", "--label", MISSION_LABEL, "--state", "open", "--limit", "50",
    "--json", "number,title,url,headRefName,isDraft,body",
  ]);
  return z.array(hubPull).parse(JSON.parse(raw) as unknown).map((p) => ({ ...p, body: p.body ?? "" }));
}

export interface NewHub {
  missionId: string;
  title: string;
  /** The PR body, also committed as the branch's first file so the PR has a commit to show. */
  body: string;
}

/** Branch + first commit go through the API, never the local checkout: starting a mission
 *  must not touch the user's working tree. */
export async function createHub(gh: Gh, hub: NewHub): Promise<{ number: number; url: string; branch: string }> {
  if (!MISSION_ID.test(hub.missionId)) throw new ReviewError("gh_failed", "invalid mission id");
  const base = (await gh.run(["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"])).trim();
  const sha = (await gh.run(["api", `${REPO}/git/ref/heads/${base}`, "--jq", ".object.sha"])).trim();
  const branch = `mission/${hub.missionId}`;
  await gh.run(["api", `${REPO}/git/refs`, "--method", "POST", "--input", "-"], JSON.stringify({ ref: `refs/heads/${branch}`, sha }));
  try {
    await gh.run(
      ["api", `${REPO}/contents/.agent-office/missions/${hub.missionId}.md`, "--method", "PUT", "--input", "-"],
      JSON.stringify({ message: `Mission: ${hub.title}`, branch, content: Buffer.from(hub.body, "utf8").toString("base64") }),
    );
    await ensureLabel(gh);
    const url = (await gh.run([
      "pr", "create", "--draft", "--base", base, "--head", branch, "--title", hub.title, "--label", MISSION_LABEL, "--body-file", "-",
    ], hub.body)).trim().split("\n").pop() ?? "";
    const number = Number(/\/pull\/(\d+)$/.exec(url)?.[1]);
    if (!Number.isSafeInteger(number) || number <= 0) throw new ReviewError("gh_failed", `pr create printed no PR url: ${url.slice(0, 200)}`);
    return { number, url, branch };
  } catch (err) {
    // A half-made hub would leave an orphan branch behind every failed start.
    await gh.run(["api", `${REPO}/git/refs/heads/${branch}`, "--method", "DELETE"]).catch(() => undefined);
    throw err;
  }
}

/** Never `--force`: that would reset the user's own colour and description on every start. */
async function ensureLabel(gh: Gh): Promise<void> {
  try {
    await gh.run(["label", "create", MISSION_LABEL, "--color", "5319e7", "--description", "Agent Office mission hub"]);
  } catch (err) {
    if (!(err instanceof ReviewError && /already exists/i.test(err.detail))) throw err;
  }
}
