import { randomBytes } from "node:crypto";
import { getDb } from "./connection";
import type { CommentCursor, MissionSeat } from "../../types/index";

interface SeatRow {
  mission_id: string;
  seat: string;
  project_id: string;
  pr_number: number;
  agent_id: string;
  instance_id: string;
  hub_branch: string;
  lead_device: string;
  manifest_json: string;
  cursor_id: number | null;
  cursor_at: string | null;
  status_comment_id: number | null;
  cap_usd: number;
  spent_usd: number;
  left_at: number | null;
  created_at: number;
}

const toSeat = (r: SeatRow): MissionSeat => ({
  missionId: r.mission_id,
  seat: r.seat,
  projectId: r.project_id,
  prNumber: r.pr_number,
  agentId: r.agent_id,
  instanceId: r.instance_id,
  hubBranch: r.hub_branch,
  leadDevice: r.lead_device,
  manifestJson: r.manifest_json,
  cursor: r.cursor_id !== null && r.cursor_at !== null ? { id: r.cursor_id, at: r.cursor_at } : null,
  statusCommentId: r.status_comment_id,
  capUsd: r.cap_usd,
  spentUsd: r.spent_usd,
  leftAt: r.left_at,
  createdAt: r.created_at,
});

export type NewMissionSeat = Pick<MissionSeat,
  "missionId" | "seat" | "projectId" | "prNumber" | "agentId" | "instanceId" | "hubBranch" | "leadDevice" | "manifestJson" | "capUsd" | "cursor">;

/** A seat re-claimed after leaving starts over: new chat, new cursor, nothing spent. */
export function insertMissionSeat(s: NewMissionSeat): MissionSeat {
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO mission_seats (mission_id, seat, project_id, pr_number, agent_id, instance_id, hub_branch, lead_device,
      manifest_json, cursor_id, cursor_at, cap_usd, spent_usd, status_comment_id, left_at, created_at, updated_at)
    VALUES (@missionId, @seat, @projectId, @prNumber, @agentId, @instanceId, @hubBranch, @leadDevice, @manifestJson,
      @cursorId, @cursorAt, @capUsd, 0, NULL, NULL, @now, @now)
    ON CONFLICT(mission_id, seat) DO UPDATE SET project_id = excluded.project_id, pr_number = excluded.pr_number,
      agent_id = excluded.agent_id, instance_id = excluded.instance_id, hub_branch = excluded.hub_branch,
      lead_device = excluded.lead_device, manifest_json = excluded.manifest_json, cursor_id = excluded.cursor_id,
      cursor_at = excluded.cursor_at, cap_usd = excluded.cap_usd, spent_usd = 0, status_comment_id = NULL,
      left_at = NULL, created_at = excluded.created_at, updated_at = excluded.updated_at
  `).run({ ...s, cursorId: s.cursor?.id ?? null, cursorAt: s.cursor?.at ?? null, now });
  const seat = getMissionSeat(s.missionId, s.seat);
  if (!seat) throw new Error("mission seat vanished after insert");
  return seat;
}

export function getMissionSeat(missionId: string, seat: string): MissionSeat | null {
  const row = getDb().prepare("SELECT * FROM mission_seats WHERE mission_id = ? AND seat = ?").get(missionId, seat) as SeatRow | undefined;
  return row ? toSeat(row) : null;
}

export function listActiveMissionSeats(): MissionSeat[] {
  const rows = getDb().prepare("SELECT * FROM mission_seats WHERE left_at IS NULL ORDER BY created_at").all() as SeatRow[];
  return rows.map(toSeat);
}

export function missionSeatForInstance(instanceId: string): MissionSeat | null {
  const row = getDb()
    .prepare("SELECT * FROM mission_seats WHERE instance_id = ? AND left_at IS NULL")
    .get(instanceId) as SeatRow | undefined;
  return row ? toSeat(row) : null;
}

/** Whether this chat ever held a seat, left or not: its worktree still checks out a hub branch. */
export function wasMissionSeat(instanceId: string): boolean {
  return getDb().prepare("SELECT 1 FROM mission_seats WHERE instance_id = ? LIMIT 1").get(instanceId) !== undefined;
}

/** Only forward: a slow tick finishing after a fast one must not re-deliver what the fast one routed. */
export function advanceMissionCursor(missionId: string, seat: string, cursor: CommentCursor): void {
  getDb().prepare(`
    UPDATE mission_seats SET cursor_id = ?, cursor_at = ?, updated_at = ?
    WHERE mission_id = ? AND seat = ? AND (cursor_id IS NULL OR cursor_id < ?)
  `).run(cursor.id, cursor.at, Date.now(), missionId, seat, cursor.id);
}

export function setMissionStatusComment(missionId: string, seat: string, commentId: number): void {
  getDb().prepare("UPDATE mission_seats SET status_comment_id = ?, updated_at = ? WHERE mission_id = ? AND seat = ?")
    .run(commentId, Date.now(), missionId, seat);
}

export function addMissionSpend(missionId: string, seat: string, usd: number): void {
  if (!(usd > 0) || !Number.isFinite(usd)) return;
  getDb().prepare("UPDATE mission_seats SET spent_usd = spent_usd + ?, updated_at = ? WHERE mission_id = ? AND seat = ?")
    .run(usd, Date.now(), missionId, seat);
}

/** The user's "allow +$N" on this device (docs/missions.md, D4). */
export function raiseMissionCap(missionId: string, seat: string, byUsd: number): void {
  if (!(byUsd > 0) || !Number.isFinite(byUsd)) return;
  getDb().prepare("UPDATE mission_seats SET cap_usd = cap_usd + ?, updated_at = ? WHERE mission_id = ? AND seat = ?")
    .run(byUsd, Date.now(), missionId, seat);
}

export function markMissionSeatLeft(missionId: string, seat: string): void {
  getDb().prepare("UPDATE mission_seats SET left_at = ?, updated_at = ? WHERE mission_id = ? AND seat = ? AND left_at IS NULL")
    .run(Date.now(), Date.now(), missionId, seat);
}

/** Every comment this device posts is logged, so a post claiming this device that is not in the
 *  log is a forgery (missions/state.ts `forged_self`). Written AHEAD of the post: a nonce first,
 *  carried in the envelope, then the comment id once GitHub answers. A post whose answer was lost
 *  (a timeout after GitHub stored it, a crash) is still recognised by its nonce. */
export function reserveMissionPost(missionId: string): string {
  const nonce = randomBytes(9).toString("base64url");
  getDb().prepare("INSERT INTO mission_posts (mission_id, nonce, comment_id, created_at) VALUES (?, ?, NULL, ?)")
    .run(missionId, nonce, Date.now());
  return nonce;
}

export function confirmMissionPost(missionId: string, nonce: string, commentId: number): void {
  getDb().prepare("UPDATE mission_posts SET comment_id = ? WHERE mission_id = ? AND nonce = ?").run(commentId, missionId, nonce);
}

/** A comment this device posted outside the nonce path (tests, or a log rebuilt by hand). */
export function recordOwnMissionPost(missionId: string, commentId: number): void {
  confirmMissionPost(missionId, reserveMissionPost(missionId), commentId);
}

export interface OwnMissionPosts {
  ids: Set<number>;
  /** Reserved nonces whose comment id never came back. */
  pending: Set<string>;
}

export function listOwnMissionPosts(missionId: string): OwnMissionPosts {
  const rows = getDb().prepare("SELECT nonce, comment_id FROM mission_posts WHERE mission_id = ?")
    .all(missionId) as Array<{ nonce: string; comment_id: number | null }>;
  const ids = new Set<number>();
  const pending = new Set<string>();
  for (const r of rows) {
    if (r.comment_id === null) pending.add(r.nonce);
    else ids.add(r.comment_id);
  }
  return { ids, pending };
}
