// When a seat's turn ends, Agent Office posts what the agent wrote in its outbox
// (docs/missions.md, "Agent Office is the only poster").
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { COORDINATOR_SEAT, MIN_SEAT_TURN_USD, MISSION_GIT_TIMEOUT_MS } from "../../config/missions";
import type { MissionSeat, PersistedRun } from "../../types/index";
import * as db from "../db";
import { log } from "../infra/log";
import { findInstance, readProject } from "../projects/projects";
import { type GhRunner } from "../review/gh";
import { ghFor, type Gh } from "../review/pulls";
import { formatPost, type Envelope } from "./envelope";
import { editComment, hubLogin, listComments, postEnvelope, remoteHasCommit } from "./hub";
import { noteForSeat } from "./notices";
import { parseOutbox, type OutboxError } from "./outbox";
import { productionPollerDeps, type PollerDeps } from "./poller";
import { outboxErrorMessage, parseManifestJson, statusHeader } from "./protocol";
import { foldMission } from "./state";

const execFileAsync = promisify(execFile);

export interface GitStamp {
  sha: string;
  branch: string;
  dirty: boolean;
}

export interface PostingDeps {
  runner: GhRunner;
  device: () => string;
  send: PollerDeps["send"];
  git: (cwd: string) => Promise<GitStamp | null>;
}

export async function gitStamp(cwd: string): Promise<GitStamp | null> {
  const git = async (args: string[]) =>
    (await execFileAsync("git", args, { cwd, encoding: "utf8", timeout: MISSION_GIT_TIMEOUT_MS, windowsHide: true })).stdout.trim();
  try {
    const [sha, branch, status] = await Promise.all([git(["rev-parse", "HEAD"]), git(["rev-parse", "--abbrev-ref", "HEAD"]), git(["status", "--porcelain"])]);
    return { sha, branch, dirty: status !== "" };
  } catch {
    return null;
  }
}

export const productionPostingDeps: PostingDeps = { ...productionPollerDeps, git: gitStamp };

/** Runs for every finished run. True when the run was a mission seat's, so the UI should refresh. */
export async function postRunOutbox(runId: string, deps: PostingDeps = productionPostingDeps): Promise<boolean> {
  const run = db.getRun(runId);
  return run ? postSeatOutbox(run, deps) : false;
}

export type FinishedRun = Pick<PersistedRun, "instanceId" | "parentRunId" | "cost" | "output" | "status">;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 200);

export async function postSeatOutbox(run: FinishedRun, deps: PostingDeps = productionPostingDeps): Promise<boolean> {
  if (!run.instanceId || run.parentRunId) return false;
  const seat = db.missionSeatForInstance(run.instanceId);
  const project = seat ? readProject(seat.projectId) : null;
  if (!seat || !project) return false;
  db.addMissionSpend(seat.missionId, seat.seat, run.cost);
  const spent = seat.spentUsd + Math.max(run.cost, 0);
  const manifest = parseManifestJson(seat.manifestJson);
  const { posts, errors } = parseOutbox(run.output, seat.seat, manifest?.seats.map((s) => s.seat) ?? []);
  // Feedback starts another turn: never past the cap, or a block the agent cannot fix would loop.
  const tell = async (failed: OutboxError[], posted: number) => {
    if (failed.length && seat.capUsd - spent >= MIN_SEAT_TURN_USD) await deps.send(seat, outboxErrorMessage(failed, posted));
  };
  // Every early stop says so, or the agent believes its posts went out. With its next delivery,
  // not as a turn of its own: a hub that stays blocked would otherwise loop turns to the cap.
  const stop = (code: OutboxError["code"], detail: string) => {
    log.warn("missions.outbox_not_posted", { missionId: seat.missionId, seat: seat.seat, code, detail, blocks: posts.length });
    if (posts.length || errors.length) noteForSeat(seat.instanceId, outboxErrorMessage([...errors, { code, detail }], 0));
    return true;
  };
  // A stopped or failed turn (Stop, its budget, a crash) posts nothing, but the agent is told.
  if (run.status !== "done") return stop("outbox_turn_stopped", run.status);
  if (!manifest) return stop("outbox_hub_blocked", "the seat's pinned manifest is unreadable");

  const gh = ghFor(project, deps.runner);
  const me = deps.device();
  const state = await hubState(seat, gh, me).catch((err: unknown) => message(err));
  if (typeof state === "string") return stop("outbox_hub_unreachable", state);
  // Same stop as the poller: a rewritten or forged hub gets no posts from this device.
  if (state.forged.length || state.lead !== seat.leadDevice) return stop("outbox_hub_blocked", "hub tampered");
  if (!Object.hasOwn(state.roster, seat.seat) || state.roster[seat.seat] !== me) return stop("outbox_hub_blocked", "not seated on this device");

  const stamped = await stampFor(seat, project, gh, deps);
  if (stamped === "unreachable") return stop("outbox_hub_unreachable", "could not check the commit on GitHub");
  const { stamp, note } = stamped;

  const failed: OutboxError[] = [...errors];
  let posted = 0;
  for (const p of posts) {
    // One refused post must not silently drop the rest: each failure goes back to the agent.
    try {
      const r = await postEnvelope(gh, seat.prNumber, `**🛰 ${seat.seat}** · ${p.kind} → ${p.to.join(", ")}`, p.text + note, {
        m: seat.missionId, kind: p.kind, from: { seat: seat.seat, device: me }, to: p.to, re: p.re, supersedes: p.supersedes, stamp,
      });
      if (r.ok) posted++;
      else failed.push({ code: r.reason === "too_long" ? "outbox_too_long" : "outbox_post_failed", detail: `${p.kind}: ${r.reason}` });
    } catch (err) {
      failed.push({ code: "outbox_post_failed", detail: `${p.kind}: ${message(err)}` });
    }
  }

  await updateStatus(seat, gh, me, posted, spent);
  await tell(failed, posted);
  if (posted) log.info("missions.posted", { missionId: seat.missionId, seat: seat.seat, posted, refused: failed.length });
  return true;
}

async function hubState(seat: MissionSeat, gh: Gh, me: string) {
  const login = await hubLogin(gh);
  return foldMission(seat.missionId, await listComments(gh, seat.prNumber, null), [login], { me, ownPosts: db.listOwnMissionPosts(seat.missionId) }).state;
}

/** Best effort: a status line that failed to update must not swallow the agent's feedback. */
async function updateStatus(seat: MissionSeat, gh: Gh, me: string, posted: number, spent: number): Promise<void> {
  if (seat.statusCommentId === null) return;
  const status = formatPost(statusHeader(seat.seat), `${posted ? "📮 posted" : "💤 idle"} · $${spent.toFixed(2)} of $${seat.capUsd.toFixed(2)}`, {
    m: seat.missionId, kind: "status", from: { seat: seat.seat, device: me }, to: [COORDINATOR_SEAT], data: { spent: Number(spent.toFixed(4)) },
  });
  if (!status.ok) return;
  await editComment(gh, seat.statusCommentId, status.body)
    .catch((err: unknown) => log.warn("missions.status_edit_failed", { missionId: seat.missionId, seat: seat.seat, err: message(err) }));
}

/** Where the posts were written. Only from the seat's own worktree: the main checkout's sha and
 *  dirty flag under the hub branch's name would send others after the wrong commit. */
async function stampFor(seat: MissionSeat, project: NonNullable<ReturnType<typeof readProject>>, gh: Gh, deps: PostingDeps):
  Promise<{ stamp: Envelope["stamp"]; note: string } | "unreachable"> {
  const cwd = findInstance(project, seat.instanceId)?.cwd;
  const local = cwd ? await deps.git(cwd) : null;
  if (!local) return { stamp: undefined, note: "" };
  // A stamp must point at something every other device can fetch; a local-only commit is named
  // in the post instead, so nobody is sent after a sha that does not exist for them.
  let pushed: boolean;
  try {
    pushed = await remoteHasCommit(gh, local.sha);
  } catch {
    return "unreachable";
  }
  // The hub branch, not the seat-local one (`<hub>--<instance>`) that exists on no other device.
  return {
    stamp: { ...(pushed ? { sha: local.sha } : {}), branch: seat.hubBranch, dirty: local.dirty },
    note: pushed ? "" : `\n\n_⚠ Written at local commit \`${local.sha.slice(0, 8)}\`, which is not on the remote yet._`,
  };
}
