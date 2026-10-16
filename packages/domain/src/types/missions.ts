import type { SeatOs } from "../config/missions";

export interface CommentCursor {
  id: number;
  /** created_at of that comment: GitHub filters by time only, never by id. */
  at: string;
}

/** A seat this device holds. Device-local bookkeeping only; the mission itself lives on GitHub. */
export interface MissionSeat {
  missionId: string;
  seat: string;
  projectId: string;
  prNumber: number;
  agentId: string;
  instanceId: string;
  hubBranch: string;
  /** The lead device as it was when this device started or joined. A fold that names another
   *  lead means the hub's history was rewritten (edited or deleted comments): stop and say so. */
  leadDevice: string;
  /** The manifest as the human saw it when starting or joining; a later PR-body edit changes nothing here. */
  manifestJson: string;
  /** The last hub comment this seat has routed; null before the first poll. */
  cursor: CommentCursor | null;
  /** This seat's status comment, edited in place so updates notify nobody. */
  statusCommentId: number | null;
  capUsd: number;
  spentUsd: number;
  leftAt: number | null;
  createdAt: number;
}

export interface PendingClaim {
  commentId: number;
  seat: string;
  device: string;
}

export interface OpenAsk {
  commentId: number;
  kind: "question" | "human-task" | "decision-request";
  seat: string;
  text: string;
}

export interface SeatView {
  seat: string;
  agent: string;
  os: SeatOs;
  brief: string;
  device: string | null;
  mine: boolean;
  paused: boolean;
  status: string | null;
}

export interface LocalSeatView {
  seat: string;
  agentId: string;
  instanceId: string;
  capUsd: number;
  spentUsd: number;
  accepted: boolean;
  /** The seat's chat stopped on a failed turn: nothing reaches it until the human retries or skips. */
  needsAttention: boolean;
}

export interface MissionView {
  missionId: string;
  title: string;
  goal: string;
  projectId: string;
  pr: number;
  url: string;
  branch: string;
  lead: string | null;
  /** This device is the lead: it alone answers claims and rulings. */
  leadHere: boolean;
  closed: boolean;
  /** Set when this device stopped routing for the hub: a human must look before anything moves. */
  alarm: null | "lead_changed" | "forged";
  /** Comments that claim this device but that it never posted: what to look at on the PR. */
  forged: number[];
  seats: SeatView[];
  claims: PendingClaim[];
  asks: OpenAsk[];
  local: LocalSeatView[];
  me: string;
}

export interface HubSeatView {
  seat: string;
  agent: string;
  os: SeatOs;
  brief: string;
  taken: boolean;
  mine: boolean;
  /** This device can take it (`any`, or the OS it runs). */
  fits: boolean;
}

export interface HubView {
  pr: number;
  title: string;
  goal: string;
  url: string;
  missionId: string;
  /** Sent back with a claim: the claim is refused if the manifest changed since. */
  manifestHash: string;
  closed: boolean;
  seats: HubSeatView[];
}
