// Mission state is never stored: it is folded from the hub's comments every time (docs/missions.md,
// D1), so any device can rebuild it. The fold is also the ONLY judge of whether a comment counts:
// each is judged against the state just before it, and routing.ts only adds "who here is it for".
import { COORDINATOR_ONLY_KINDS, COORDINATOR_SEAT, TO_HUMAN, isAgentPostKind } from "../../config/missions";
import type { OpenAsk, PendingClaim } from "../../types/index";
import { acceptedDevice, isSeatId, movedTo, parsePost, type Envelope } from "./envelope";

export interface HubComment {
  id: number;
  author: string;
  body: string;
  /** GitHub's updated_at differs from created_at: the body is not what was posted. */
  edited?: boolean;
}

export interface MissionState {
  /** The coordinator's device: the only one whose clicks (accept, pause, decision…) count. */
  lead: string | null;
  /** Accepted seat → the device it was accepted on. */
  roster: Record<string, string>;
  claims: PendingClaim[];
  /** Addressed to the human and not yet answered. */
  asks: OpenAsk[];
  paused: string[];
  status: Record<string, { commentId: number; text: string }>;
  closed: boolean;
  movedTo: number | null;
  /** Comments that claim to be this device's but that it never posted: someone is forging it. */
  forged: number[];
}

export type IgnoreReason =
  | "untrusted_author"
  | "unreadable_envelope"
  | "other_mission"
  | "edited"
  | "forged_self"
  | "mission_closed"
  | "not_on_roster"
  | "not_from_lead"
  | "coordinator_only"
  | "seat_taken"
  | "invalid_target";

export type Verdict =
  /** `envelope: null` is a plain comment: the human typing on the PR. */
  | { applied: true; envelope: Envelope | null; text: string }
  | { applied: false; reason: IgnoreReason };

export interface FoldOptions {
  /** This device, and what it posted itself (db.listOwnMissionPosts): confirmed comment ids, and
   *  the nonces of posts whose id never came back. */
  me?: string;
  ownPosts?: { ids: ReadonlySet<number>; pending: ReadonlySet<string> };
}

export interface Fold {
  state: MissionState;
  verdicts: Map<number, Verdict>;
}

const ASK_KINDS: ReadonlySet<string> = new Set<OpenAsk["kind"]>(["question", "human-task", "decision-request"]);
const isAskKind = (k: string): k is OpenAsk["kind"] => ASK_KINDS.has(k);
/** The human's clicks on the lead device. */
const LEAD_ACTS: ReadonlySet<string> = new Set(["reject", "pause", "resume", "close", "moved", "decision"]);

export function foldMission(missionId: string, comments: readonly HubComment[], allowedAuthors: readonly string[], opts: FoldOptions = {}): Fold {
  const s: MissionState = { lead: null, roster: {}, claims: [], asks: [], paused: [], status: {}, closed: false, movedTo: null, forged: [] };
  const verdicts = new Map<number, Verdict>();
  const allowed = new Set(allowedAuthors.map((a) => a.toLowerCase()));
  const ctx: Judging = { missionId, allowed, opts, nonceUsed: new Set<string>() };
  for (const c of [...comments].sort((a, b) => a.id - b.id)) {
    const v = judge(s, c, ctx);
    verdicts.set(c.id, v);
  }
  return { state: s, verdicts };
}

/** This device's comment, or one pretending to be? A pending nonce vouches only for the FIRST comment
 *  carrying it: the nonce is visible in that comment, so a later copy is the forgery. */
function mine(c: HubComment, e: Envelope, own: NonNullable<FoldOptions["ownPosts"]>, nonceUsed: Set<string>): boolean {
  if (own.ids.has(c.id)) return true;
  const n = e.data?.n;
  if (typeof n !== "string" || !own.pending.has(n) || nonceUsed.has(n)) return false;
  nonceUsed.add(n);
  return true;
}

interface Judging {
  missionId: string;
  allowed: ReadonlySet<string>;
  opts: FoldOptions;
  nonceUsed: Set<string>;
}

function judge(s: MissionState, c: HubComment, { missionId, allowed, opts, nonceUsed }: Judging): Verdict {
  const no = (reason: IgnoreReason): Verdict => ({ applied: false, reason });
  if (!allowed.has(c.author.toLowerCase())) return no("untrusted_author");
  const post = parsePost(c.body);
  // A near-miss envelope (no blank line before it, `}-->`) is a broken or spoofed post, never the
  // human typing: agent bodies have `<!--` neutralised, and GitHub's quote-reply drops hidden comments.
  if (!post.ok) {
    const plain = post.reason === "no_envelope" && !c.body.includes("<!-- ao:v");
    return plain ? { applied: true, envelope: null, text: c.body.trim() } : no("unreadable_envelope");
  }
  const e = post.envelope;
  if (e.m !== missionId) return no("other_mission");
  if (opts.me !== undefined && opts.ownPosts && e.from.device === opts.me && !mine(c, e, opts.ownPosts, nonceUsed)) {
    s.forged.push(c.id);
    return no("forged_self");
  }
  if (s.closed) return no("mission_closed");
  // Rewriting an old comment would rewrite history before the lead was seated. Status comments
  // are the one kind edited in place by design.
  if (c.edited && e.kind !== "status") return no("edited");
  const reason = apply(s, c.id, e, post.text);
  return reason ? no(reason) : { applied: true, envelope: e, text: post.text };
}

/** Applies `e` to `s` and returns null, or returns why it does not count and leaves `s` alone. */
function apply(s: MissionState, id: number, e: Envelope, text: string): IgnoreReason | null {
  const held = (seat: string) => Object.hasOwn(s.roster, seat);
  const fromLead = s.lead !== null && e.from.device === s.lead;
  const fromHuman = e.from.seat === TO_HUMAN;
  const onRoster = isSeatId(e.from.seat) && held(e.from.seat) && s.roster[e.from.seat] === e.from.device;
  const target = e.to[0] ?? "";
  if (LEAD_ACTS.has(e.kind)) return fromLead && fromHuman ? applyLeadAct(s, e, held) : "not_from_lead";
  switch (e.kind) {
    case "claim":
      if (!isSeatId(e.from.seat)) return "invalid_target";
      if (held(e.from.seat)) return "seat_taken";
      s.claims.push({ commentId: id, seat: e.from.seat, device: e.from.device });
      return null;
    case "accept": {
      const device = acceptedDevice(e);
      // Bootstrap: the mission's first act is its creator accepting itself as coordinator.
      const bootstrap = s.lead === null && target === COORDINATOR_SEAT && device === e.from.device;
      if (!fromHuman || !(fromLead || bootstrap)) return "not_from_lead";
      if (device === null || !isSeatId(target) || e.to.length !== 1) return "invalid_target";
      if (held(target)) return "seat_taken";
      s.roster[target] = device;
      if (target === COORDINATOR_SEAT) s.lead = device;
      s.claims = s.claims.filter((cl) => cl.seat !== target);
      return null;
    }
    case "leave": {
      const seat = fromLead && fromHuman ? target : onRoster ? e.from.seat : null;
      if (seat === null) return "not_on_roster";
      if (seat === COORDINATOR_SEAT || !held(seat)) return "invalid_target";
      delete s.roster[seat];
      delete s.status[seat];
      s.paused = s.paused.filter((p) => p !== seat);
      return null;
    }
    case "status":
      if (!onRoster) return "not_on_roster";
      s.status[e.from.seat] = { commentId: id, text };
      return null;
    case "reply":
      // The human answers from whichever rostered device they sit at.
      if (!fromHuman || !Object.values(s.roster).includes(e.from.device)) return "not_on_roster";
      s.asks = s.asks.filter((a) => !(a.commentId === e.re && e.to.includes(a.seat)));
      return null;
    default:
      if (!onRoster) return "not_on_roster";
      if (isAgentPostKind(e.kind) && COORDINATOR_ONLY_KINDS.includes(e.kind) && e.from.seat !== COORDINATOR_SEAT) return "coordinator_only";
      if (isAskKind(e.kind) && e.to.includes(TO_HUMAN)) s.asks.push({ commentId: id, kind: e.kind, seat: e.from.seat, text });
      return null;
  }
}

function applyLeadAct(s: MissionState, e: Envelope, held: (seat: string) => boolean): IgnoreReason | null {
  switch (e.kind) {
    case "reject":
      s.claims = s.claims.filter((cl) => cl.commentId !== e.re);
      return null;
    case "pause":
      s.paused = [...new Set([...s.paused, ...e.to.filter(held)])];
      return null;
    case "resume":
      s.paused = s.paused.filter((p) => !e.to.includes(p));
      return null;
    case "close":
      s.closed = true;
      return null;
    case "moved": {
      const pr = movedTo(e);
      if (pr === null) return "invalid_target";
      s.movedTo = pr;
      return null;
    }
    default:
      s.asks = s.asks.filter((a) => !(a.commentId === e.re && e.to.includes(a.seat)));
      return null;
  }
}
