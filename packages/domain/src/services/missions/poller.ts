// Turns hub comments into turns for the seats this device holds (docs/missions.md, "The poller").
// One server per machine polls (the "missions" lease); each hub is read and folded once per tick.
import { COORDINATOR_SEAT, MIN_SEAT_TURN_USD, MISSION_POLL } from "../../config/missions";
import type { MissionSeat } from "../../types/index";
import * as db from "../db";
import { sendMessage } from "../execution/conversation";
import { productionConversationRunner } from "../execution/conversation-runner";
import { emitAppEvent } from "../infra/events";
import { log } from "../infra/log";
import { readProject } from "../projects/projects";
import { ghEnv, runGh, type GhRunner } from "../review/gh";
import { ghFor, type Gh } from "../review/pulls";
import { deviceId } from "./device";
import { hubLogin, listComments, postEnvelope, type FetchedComment } from "./hub";
import { noteForSeat, takeSeatNotes } from "./notices";
import { digestMessage, parseManifestJson, statusHeader, welcomeMessage, type Delivery } from "./protocol";
import { routeComment } from "./routing";
import { foldMission, type Fold, type MissionState } from "./state";

export interface PollerDeps {
  runner: GhRunner;
  device: () => string;
  /** Posts into the seat's chat, starting a turn or queueing one: as Agent Office ("system"), or as
   *  the user for words the human typed into Agent Office itself (a ruling). */
  send: (seat: MissionSeat, text: string, origin?: "user" | "system") => Promise<unknown>;
  /** The seat's chat is running, has queued messages, or waits for attention. */
  busy: (seat: MissionSeat) => boolean;
}

/** Every queued message becomes its own turn, and spend only moves when one finishes: queueing
 *  behind a busy chat would run turn after turn past the cap. So nothing is sent until it is idle. */
function seatBusy(seat: MissionSeat): boolean {
  const conv = db.getActiveConversation(seat.agentId, seat.instanceId);
  return conv !== null && (conv.status !== "idle" || db.queueLength(conv.id) > 0);
}

export const productionPollerDeps: PollerDeps = {
  runner: runGh,
  device: deviceId,
  send: (s, text, origin = "system") => sendMessage(s.agentId, s.instanceId, s.projectId, text, productionConversationRunner, undefined, origin),
  busy: seatBusy,
};

// Keyed by the GitHub account too: a project switched to another account trusts the new login.
const logins = new Map<string, string>();
async function loginFor(project: NonNullable<ReturnType<typeof readProject>>, gh: Gh): Promise<string> {
  const key = `${project.id}|${ghEnv(project).GH_CONFIG_DIR ?? ""}`;
  const known = logins.get(key);
  if (known) return known;
  const login = await hubLogin(gh);
  logins.set(key, login);
  return login;
}

/** The alarm last logged per mission: a tampered hub is reported once, not every tick. */
const alarms = new Map<string, string>();

/** One pass over every hub this device has a seat in. Exported for tests; the timer calls it. */
export async function pollMissions(deps: PollerDeps = productionPollerDeps): Promise<void> {
  const byHub = new Map<string, MissionSeat[]>();
  for (const s of db.listActiveMissionSeats()) {
    const key = `${s.projectId}#${s.prNumber}`;
    byHub.set(key, [...(byHub.get(key) ?? []), s]);
  }
  let changed = false;
  for (const seats of byHub.values()) {
    try {
      changed = (await pollHub(seats, deps)) || changed;
    } catch (err) {
      const first = seats[0];
      log.warn("missions.poll_failed", { missionId: first?.missionId, pr: first?.prNumber, message: err instanceof Error ? err.message : String(err) });
    }
  }
  if (changed) emitAppEvent("missions:changed");
}

async function pollHub(seats: MissionSeat[], deps: PollerDeps): Promise<boolean> {
  const first = seats[0];
  const project = first ? readProject(first.projectId) : null;
  if (!first || !project) return false;
  const gh = ghFor(project, deps.runner);
  const login = await loginFor(project, gh);
  const comments = await listComments(gh, first.prNumber, null);
  const me = deps.device();
  const fold = foldMission(first.missionId, comments, [login], { me, ownPosts: db.listOwnMissionPosts(first.missionId) });
  const { state } = fold;
  // History rewritten (the lead's seating edited or deleted) or this device forged: route nothing
  // until a human looks. The UI shows the alarm from the same fold.
  if (fold.state.forged.length || seats.some((s) => s.leadDevice !== state.lead)) {
    const alarm = JSON.stringify([state.lead, state.forged]);
    if (alarms.get(first.missionId) === alarm) return false;
    alarms.set(first.missionId, alarm);
    log.error("missions.hub_tampered", { missionId: first.missionId, pr: first.prNumber, lead: state.lead, pinned: first.leadDevice, forged: state.forged });
    return true;
  }
  alarms.delete(first.missionId);
  let changed = false;
  for (const seat of seats) {
    if (state.closed) {
      db.markMissionSeatLeft(seat.missionId, seat.seat);
      changed = true;
      continue;
    }
    changed = (await pollSeat(seat, { comments, fold, me, gh, deps })) || changed;
  }
  return changed;
}

interface HubRead {
  comments: FetchedComment[];
  fold: Fold;
  me: string;
  gh: Gh;
  deps: PollerDeps;
}

async function pollSeat(seat: MissionSeat, { comments, fold, me, gh, deps }: HubRead): Promise<boolean> {
  const { state, verdicts } = fold;
  const fresh = comments.filter((c) => !seat.cursor || c.id > seat.cursor.id);
  // Not seated yet (claim pending), paused, or out of budget: hold the cursor so nothing addressed
  // to this seat is lost — it is delivered once the lead accepts, resumes, or the cap is raised.
  const seated = Object.hasOwn(state.roster, seat.seat) && state.roster[seat.seat] === me;
  // Rejected, evicted, or seated elsewhere: nothing will ever be routed here again. Only once the
  // list has caught up with this seat's own claim: GitHub can list comments a moment behind the post.
  const caughtUp = !seat.cursor || comments.some((c) => c.id >= (seat.cursor?.id ?? 0));
  if (!seated && caughtUp && !state.claims.some((c) => c.seat === seat.seat && c.device === me)) {
    db.markMissionSeatLeft(seat.missionId, seat.seat);
    takeSeatNotes(seat.instanceId);
    return true;
  }
  if (!seated || state.paused.includes(seat.seat) || seat.capUsd - seat.spentUsd < MIN_SEAT_TURN_USD || deps.busy(seat)) return false;

  const deliveries: Delivery[] = [];
  for (const c of fresh) {
    const verdict = verdicts.get(c.id);
    if (!verdict) continue;
    const r = routeComment(verdict, { held: [seat.seat], me });
    if (r.action === "deliver" && r.seats.includes(seat.seat)) deliveries.push({ commentId: c.id, envelope: r.envelope, text: r.text });
    else if (r.action === "human-words") deliveries.push({ commentId: c.id, envelope: r.envelope, text: r.text, unverified: !r.verified });
    else if (r.action === "human-input") deliveries.push({ commentId: c.id, envelope: null, text: r.text });
  }

  const parts: string[] = [];
  const seating = seat.statusCommentId === null ? await seatIn(seat, state, me, gh) : null;
  if (seating) parts.push(seating.welcome);
  if (deliveries.length) parts.push(digestMessage(seat.prNumber, deliveries));
  // Held notes go out even alone: a seat whose last result never posted would otherwise wait forever.
  const notes = takeSeatNotes(seat.instanceId);
  if (notes.length || parts.length) {
    try {
      await deps.send(seat, [...notes, ...parts].join("\n\n"));
    } catch (err) {
      for (const n of notes) noteForSeat(seat.instanceId, n);
      throw err;
    }
  }
  // Only once the welcome is delivered: a failed send must bring it again on the next tick.
  if (seating) db.setMissionStatusComment(seat.missionId, seat.seat, seating.statusId);
  const last = fresh.at(-1);
  if (last) db.advanceMissionCursor(seat.missionId, seat.seat, { id: last.id, at: last.at });
  return notes.length > 0 || parts.length > 0 || fresh.length > 0;
}

/** First tick after the lead accepted: post the seat's status comment (edited in place from now
 *  on) and hand the agent its welcome. A welcome whose send failed comes again next tick, with the
 *  status comment it already posted: one per seat, not one per retry. */
async function seatIn(seat: MissionSeat, state: MissionState, me: string, gh: Gh): Promise<{ welcome: string; statusId: number }> {
  // The pinned manifest: what the human saw when joining, not whatever the PR body says now.
  const manifest = parseManifestJson(seat.manifestJson);
  if (!manifest) throw new Error(`seat ${seat.seat} of ${seat.missionId} has no readable manifest`);
  const welcome = welcomeMessage({ manifest, seat: seat.seat, pr: seat.prNumber, branch: seat.hubBranch, roster: state.roster });
  const posted = Object.hasOwn(state.status, seat.seat) ? state.status[seat.seat] : undefined;
  if (posted) return { statusId: posted.commentId, welcome };
  const status = await postEnvelope(gh, seat.prNumber, statusHeader(seat.seat), "🟢 seated", {
    m: seat.missionId, kind: "status", from: { seat: seat.seat, device: me }, to: [COORDINATOR_SEAT], data: { spent: 0 },
  });
  if (!status.ok) throw new Error(`status post refused: ${status.reason}`);
  return { statusId: status.cursor.id, welcome };
}

let ticking = false;
async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    if (db.listActiveMissionSeats().length === 0 || !db.holdLoopLease("missions")) return;
    await pollMissions();
  } catch (err) {
    log.warn("missions.tick_error", { message: err instanceof Error ? err.message : String(err) });
  } finally {
    ticking = false;
  }
}

declare global {
  var __agentOfficeMissionsTimer: ReturnType<typeof setInterval> | undefined;
}

/** Idempotent across HMR, like the scheduler. */
export function startMissionPoller(): void {
  if (globalThis.__agentOfficeMissionsTimer) return;
  const timer = setInterval(() => { void tick(); }, MISSION_POLL.tickMs);
  timer.unref();
  globalThis.__agentOfficeMissionsTimer = timer;
  setTimeout(() => { void tick(); }, MISSION_POLL.firstTickMs).unref();
  log.info("missions.poller_started", { tickMs: MISSION_POLL.tickMs });
}
