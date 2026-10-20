// What a human's click does to a mission (docs/missions.md, "The flow"). Every action re-reads the
// hub and folds it first: the decision is taken against GitHub as it is now, never a local copy.
import { randomBytes } from "node:crypto";
import { arch, cpus, platform, release } from "node:os";
import { COORDINATOR_SEAT } from "../../config/missions";
import type { MissionSeat, Project } from "../../types/index";
import * as db from "../db";
import { applyGitCredentialHelper } from "../execution/runs/spawn-env";
import { addSeatInstance, readProject } from "../projects/projects";
import { createMissionWorktree } from "../projects/worktrees";
import { ghEnv, type GhRunner } from "../review/gh";
import { ghFor, type Gh } from "../review/pulls";
import { ActionError, change } from "./result";
import { deviceLabel } from "./device";
import type { Envelope } from "./envelope";
import { abandonHub, createHub, getHub, hubLogin, listComments, postEnvelope, remoteHasBranch } from "./hub";
import { productionPollerDeps, type PollerDeps } from "./poller";
import { hubBody, manifestHash, readManifest, type MissionManifest, type SeatSpec } from "./protocol";
import { foldMission, type MissionState } from "./state";

export interface ActionDeps {
  runner: GhRunner;
  worktree: typeof createMissionWorktree;
  device: () => string;
  send: PollerDeps["send"];
}

export const productionActionDeps: ActionDeps = { ...productionPollerDeps, worktree: createMissionWorktree };

function projectOf(id: string): { project: Project; cwd: string } {
  const project = readProject(id);
  const cwd = project?.meta.cwd;
  if (!project || !cwd) throw new ActionError("project_not_found", id);
  return { project, cwd };
}

/** git over HTTPS as the project's GitHub account, as runs do (runs/spawn-env.ts). */
function gitEnv(project: Project): NodeJS.ProcessEnv {
  const env = ghEnv(project);
  if (env.GH_CONFIG_DIR) applyGitCredentialHelper(env);
  return env;
}

export interface Hub {
  gh: Gh;
  project: Project;
  cwd: string;
  pr: number;
  url: string;
  manifest: MissionManifest;
  branch: string;
  state: MissionState;
  me: string;
}

export async function readHub(projectId: string, pr: number, deps: ActionDeps): Promise<Hub> {
  const { project, cwd } = projectOf(projectId);
  const gh = ghFor(project, deps.runner);
  const [pull, login] = await Promise.all([getHub(gh, pr), hubLogin(gh)]);
  const manifest = readManifest(pull.body);
  if (!manifest) throw new ActionError("not_a_mission", `#${pr}`);
  // The welcome tells seats to push to this branch: a fork's, or one the body does not name, is not a hub.
  if (pull.isCrossRepository || pull.headRefName !== `mission/${manifest.m}`) throw new ActionError("not_a_mission", `#${pr} branch`);
  const me = deps.device();
  const { state } = foldMission(manifest.m, await listComments(gh, pr, null), [login], { me, ownPosts: db.listOwnMissionPosts(manifest.m) });
  return { gh, project, cwd, pr, url: pull.url, manifest, branch: pull.headRefName, state, me };
}

export async function post(h: Hub, header: string, text: string, env: Omit<Envelope, "m">) {
  const r = await postEnvelope(h.gh, h.pr, header, text, { m: h.manifest.m, ...env });
  if (!r.ok) throw new ActionError("manifest_invalid", r.reason);
  return r.cursor;
}

const stamp = () => ({ os: `${platform()} ${release()}`.slice(0, 64), hw: `${cpus()[0]?.model ?? arch()}`.trim().slice(0, 128) });

/** The seat's chat and worktree, with the lead and manifest pinned as the human saw them now. */
function seatUp(h: Hub, spec: SeatSpec, pin: { capUsd: number; lead: string; cursor: { id: number; at: string } }, deps: ActionDeps): MissionSeat {
  let instanceId: string;
  try {
    ({ instance: { instanceId } } = addSeatInstance(h.project.id, spec.agent, `🛰 ${spec.seat} · ${h.manifest.title}`.slice(0, 80),
      (id) => deps.worktree(h.cwd, id, h.branch, gitEnv(h.project))));
  } catch (err) {
    throw new ActionError("worktree_failed", err instanceof Error ? err.message.slice(0, 300) : String(err));
  }
  return db.insertMissionSeat({
    missionId: h.manifest.m, seat: spec.seat, projectId: h.project.id, prNumber: h.pr, agentId: spec.agent, instanceId,
    hubBranch: h.branch, leadDevice: pin.lead, manifestJson: JSON.stringify(h.manifest), capUsd: pin.capUsd, cursor: pin.cursor,
  });
}

export interface StartInput {
  title: string;
  goal: string;
  budgetUsd: number;
  seats: SeatSpec[];
  /** This device's cap for the coordinator seat. */
  capUsd: number;
}

export function startMission(projectId: string, input: StartInput, deps: ActionDeps = productionActionDeps) {
  return change(async () => {
    const { project, cwd } = projectOf(projectId);
    const gh = ghFor(project, deps.runner);
    const manifest: MissionManifest = { m: randomBytes(5).toString("hex").slice(0, 8), title: input.title, goal: input.goal, budgetUsd: input.budgetUsd, seats: input.seats };
    let body: string;
    try {
      body = hubBody(manifest);
    } catch {
      throw new ActionError("manifest_invalid");
    }
    const spec = manifest.seats.find((s) => s.seat === COORDINATOR_SEAT);
    if (!spec) throw new ActionError("manifest_invalid");
    const hub = await createHub(gh, { missionId: manifest.m, title: `🛰 ${input.title}`, body });
    const me = deps.device();
    const h: Hub = { gh, project, cwd, pr: hub.number, url: hub.url, manifest, branch: hub.branch, state: foldMission(manifest.m, [], []).state, me };
    try {
      const cursor = await post(h, `**🛰 coordinator** seated on ${deviceLabel()}`, "The mission is open. Claim a seat from Agent Office on the device it needs.",
        { kind: "accept", from: { seat: "human", device: me }, to: [COORDINATOR_SEAT], data: { device: me }, stamp: stamp() });
      const seat = seatUp(h, spec, { capUsd: input.capUsd, lead: me, cursor }, deps);
      return { missionId: manifest.m, pr: hub.number, url: hub.url, instanceId: seat.instanceId };
    } catch (err) {
      // Seated on GitHub but not here (or not even seated) is a hub nobody can recover: close it.
      await abandonHub(gh, hub.number);
      throw err;
    }
  });
}

export interface ClaimInput {
  projectId: string;
  pr: number;
  seat: string;
  capUsd: number;
  /** The manifest hash the human saw in Join (views.ts joinableHubs). */
  manifestHash: string;
}

export function claimSeat({ projectId, pr, seat: seatId, capUsd, manifestHash: seen }: ClaimInput, deps: ActionDeps = productionActionDeps) {
  return change(async () => {
    const h = await readHub(projectId, pr, deps);
    if (manifestHash(h.manifest) !== seen) throw new ActionError("manifest_changed");
    const spec = h.manifest.seats.find((s) => s.seat === seatId);
    if (!spec) throw new ActionError("seat_unknown", seatId);
    if (spec.os !== "any" && spec.os !== platform()) throw new ActionError("seat_wrong_os", spec.os);
    if (h.state.closed) throw new ActionError("mission_closed");
    if (h.state.lead === null) throw new ActionError("not_a_mission", "no lead seated");
    if (Object.hasOwn(h.state.roster, seatId)) throw new ActionError("seat_taken", seatId);
    const local = db.getMissionSeat(h.manifest.m, seatId);
    if (local && local.leftAt === null) throw new ActionError("seat_held_here", seatId);
    if (!(await remoteHasBranch(h.gh, h.branch))) throw new ActionError("branch_missing", h.branch);
    const cursor = await post(h, `**🛰 ${seatId}** claimed by ${deviceLabel()}`, `Asks for seat \`${seatId}\` (${spec.agent}). The lead accepts or rejects it in Agent Office.`,
      { kind: "claim", from: { seat: seatId, device: h.me }, to: [COORDINATOR_SEAT], stamp: stamp() });
    return seatUp(h, spec, { capUsd, lead: h.state.lead, cursor }, deps);
  });
}

export function leaveSeat(missionId: string, seatId: string, deps: ActionDeps = productionActionDeps) {
  return change(async () => {
    const seat = db.getMissionSeat(missionId, seatId);
    if (!seat || seat.leftAt !== null) throw new ActionError("not_seated", seatId);
    if (seatId === COORDINATOR_SEAT) throw new ActionError("not_lead", "the coordinator closes the mission instead");
    const h = await readHub(seat.projectId, seat.prNumber, deps);
    if (Object.hasOwn(h.state.roster, seatId) && h.state.roster[seatId] === h.me) {
      await post(h, `**🛰 ${seatId}** left`, `Device ${deviceLabel()} gave up the seat.`, { kind: "leave", from: { seat: seatId, device: h.me }, to: [COORDINATOR_SEAT] });
    }
    db.markMissionSeatLeft(missionId, seatId);
  });
}

/** The human's "allow +$N" for a seat on this device (D4): a local cap, so a local click. */
export function raiseSeatCap(missionId: string, seatId: string, byUsd: number) {
  return change(async () => {
    const seat = db.getMissionSeat(missionId, seatId);
    if (!seat || seat.leftAt !== null) throw new ActionError("not_seated", seatId);
    db.raiseMissionCap(missionId, seatId, byUsd);
    return { capUsd: seat.capUsd + byUsd };
  });
}
