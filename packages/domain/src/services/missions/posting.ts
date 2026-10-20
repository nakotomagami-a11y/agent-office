// When a seat's turn ends, Agent Office posts what the agent wrote in its outbox
// (docs/missions.md, "Agent Office is the only poster").
import { execFileSync } from "node:child_process";
import { COORDINATOR_SEAT } from "../../config/missions";
import type { PersistedRun } from "../../types/index";
import * as db from "../db";
import { log } from "../infra/log";
import { findInstance, readProject } from "../projects/projects";
import { type GhRunner } from "../review/gh";
import { ghFor } from "../review/pulls";
import { formatPost, type Envelope } from "./envelope";
import { editComment, hubLogin, listComments, postEnvelope, remoteHasCommit } from "./hub";
import { parseOutbox, type OutboxError } from "./outbox";
import { productionPollerDeps, type PollerDeps } from "./poller";
import { outboxErrorMessage, parseManifestJson } from "./protocol";
import { foldMission } from "./state";

export interface GitStamp {
  sha: string;
  branch: string;
  dirty: boolean;
}

export interface PostingDeps {
  runner: GhRunner;
  device: () => string;
  send: PollerDeps["send"];
  git: (cwd: string) => GitStamp | null;
}

export function gitStamp(cwd: string): GitStamp | null {
  const git = (args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 }).trim();
  try {
    return { sha: git(["rev-parse", "HEAD"]), branch: git(["rev-parse", "--abbrev-ref", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "" };
  } catch {
    return null;
  }
}

export const productionPostingDeps: PostingDeps = { ...productionPollerDeps, git: gitStamp };

/** Runs for every finished run; returns at once unless the run belongs to a mission seat. */
export async function postRunOutbox(runId: string, deps: PostingDeps = productionPostingDeps): Promise<void> {
  const run = db.getRun(runId);
  if (run) await postSeatOutbox(run, deps);
}

export type FinishedRun = Pick<PersistedRun, "instanceId" | "parentRunId" | "cost" | "output" | "status">;

export async function postSeatOutbox(run: FinishedRun, deps: PostingDeps = productionPostingDeps): Promise<void> {
  if (!run.instanceId || run.parentRunId) return;
  const seat = db.missionSeatForInstance(run.instanceId);
  const project = seat ? readProject(seat.projectId) : null;
  if (!seat || !project) return;
  db.addMissionSpend(seat.missionId, seat.seat, run.cost);
  const spent = seat.spentUsd + Math.max(run.cost, 0);
  // A stopped or failed turn costs money but says nothing: Stop is a hard stop, posts included.
  if (run.status !== "done") return;

  const manifest = parseManifestJson(seat.manifestJson);
  if (!manifest) return;
  const gh = ghFor(project, deps.runner);
  const me = deps.device();
  const login = await hubLogin(gh);
  const { state } = foldMission(seat.missionId, await listComments(gh, seat.prNumber, null), [login], { me, ownPosts: db.listOwnMissionPosts(seat.missionId) });
  // Same stop as the poller: a rewritten or forged hub gets no posts from this device.
  if (state.forged.length || state.lead !== seat.leadDevice) return;
  if (!Object.hasOwn(state.roster, seat.seat) || state.roster[seat.seat] !== me) return;

  const { posts, errors } = parseOutbox(run.output, seat.seat, manifest.seats.map((s) => s.seat));
  const cwd = findInstance(project, seat.instanceId)?.cwd ?? project.meta.cwd;
  const local = cwd ? deps.git(cwd) : null;
  // A stamp must point at something every other device can fetch; a local-only commit is named
  // in the post instead, so nobody is sent after a sha that does not exist for them.
  const pushed = local ? await remoteHasCommit(gh, local.sha) : false;
  // The hub branch, not the seat-local one (`<hub>--<instance>`) that exists on no other device.
  const stamp: Envelope["stamp"] = local ? { ...(pushed ? { sha: local.sha } : {}), branch: seat.hubBranch, dirty: local.dirty } : undefined;
  const note = local && !pushed ? `\n\n_⚠ Written at local commit \`${local.sha.slice(0, 8)}\`, which is not on the remote yet._` : "";

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
      failed.push({ code: "outbox_post_failed", detail: `${p.kind}: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}` });
    }
  }

  if (seat.statusCommentId !== null) {
    const status = formatPost(`**🛰 ${seat.seat}** · status`, `${posted ? "📮 posted" : "💤 idle"} · $${spent.toFixed(2)} of $${seat.capUsd.toFixed(2)}`, {
      m: seat.missionId, kind: "status", from: { seat: seat.seat, device: me }, to: [COORDINATOR_SEAT], data: { spent: Number(spent.toFixed(4)) },
    });
    if (status.ok) await editComment(gh, seat.statusCommentId, status.body);
  }
  // Feedback starts another turn: never past the cap, or a block the agent cannot fix would loop.
  if (failed.length && spent < seat.capUsd) await deps.send(seat, outboxErrorMessage(failed, posted));
  if (posted) log.info("missions.posted", { missionId: seat.missionId, seat: seat.seat, posted, refused: failed.length });
}
