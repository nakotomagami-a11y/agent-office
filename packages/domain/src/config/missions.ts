// Missions: agents on several devices coordinating through a GitHub draft PR (docs/missions.md).

export const MISSION_ENVELOPE_VERSION = 1;
export const MISSION_LABEL = "ao-mission";
/** GitHub rejects an issue comment longer than this. */
export const MAX_COMMENT_CHARS = 65_536;

export const COORDINATOR_SEAT = "coordinator";
export const TO_HUMAN = "human";
export const TO_ALL = "all";
export const SEAT_ID = /^[a-z][a-z0-9-]{0,31}$/;
export const MISSION_ID = /^[a-z0-9]{4,16}$/;

/** What a seat's agent may post through its outbox. */
export const AGENT_POST_KINDS = [
  "brief",
  "roll-call",
  "phase",
  "work-order",
  "contract-change",
  "decision-request",
  "result",
  "question",
  "answer",
  "blocker",
  "human-task",
] as const;
export type AgentPostKind = (typeof AGENT_POST_KINDS)[number];

/** Steering the whole mission is the coordinator's job; a seat asking for it uses `question`. */
export const COORDINATOR_ONLY_KINDS: readonly AgentPostKind[] = [
  "brief",
  "roll-call",
  "phase",
  "work-order",
  "contract-change",
  "decision-request",
];

/** Posted by Agent Office itself, from a human's click or its own bookkeeping. Never from an
 *  outbox, and never handed to an agent as an instruction: an agent that could post `accept`
 *  or `decision` could approve itself (docs/missions.md, D6). */
export const CONTROL_POST_KINDS = [
  "claim",
  "accept",
  "reject",
  "decision",
  "reply",
  "pause",
  "resume",
  "leave",
  "moved",
  "close",
  "status",
] as const;
export type ControlPostKind = (typeof CONTROL_POST_KINDS)[number];

export const MISSION_POST_KINDS = [...AGENT_POST_KINDS, ...CONTROL_POST_KINDS] as const;
export type MissionPostKind = (typeof MISSION_POST_KINDS)[number];

export const isAgentPostKind = (v: unknown): v is AgentPostKind =>
  typeof v === "string" && (AGENT_POST_KINDS as readonly string[]).includes(v);
export const isControlPostKind = (v: unknown): v is ControlPostKind =>
  typeof v === "string" && (CONTROL_POST_KINDS as readonly string[]).includes(v);
export const isMissionPostKind = (v: unknown): v is MissionPostKind =>
  typeof v === "string" && (MISSION_POST_KINDS as readonly string[]).includes(v);

/** The envelope's limit, so an outbox never accepts a post the envelope would then refuse. */
export const MAX_RECIPIENTS = 16;

export const MISSION_ERROR_CODES = [
  "outbox_malformed",
  "outbox_inner_fence",
  "outbox_header_unknown",
  "outbox_id_invalid",
  "outbox_kind_unknown",
  "outbox_kind_forbidden",
  "outbox_recipient_invalid",
  "outbox_empty",
  "outbox_too_long",
  "outbox_post_failed",
] as const;
export type MissionErrorCode = (typeof MISSION_ERROR_CODES)[number];
export const isMissionErrorCode = (v: unknown): v is MissionErrorCode =>
  typeof v === "string" && (MISSION_ERROR_CODES as readonly string[]).includes(v);

/** RULE errors.machine-codes: every code says what fixes it. These go back to the agent. */
export const MISSION_ERROR_REMEDIATION: Record<MissionErrorCode, string> = {
  outbox_malformed: "Write the post as a fenced ao-post block: header lines (to:, kind:), a line with ---, then the body, then the same fence.",
  outbox_inner_fence: "The body opens a code block with the same fence as the post: use a longer outer fence (````ao-post) so the post does not end early.",
  outbox_header_unknown: "Header lines are only to:, kind:, re: and supersedes:, each at most once.",
  outbox_id_invalid: "re: and supersedes: take the numeric id of a GitHub comment on the hub.",
  outbox_kind_unknown: `kind: must be one of ${AGENT_POST_KINDS.filter((k) => !COORDINATOR_ONLY_KINDS.includes(k)).join(", ")} (the coordinator also posts ${COORDINATOR_ONLY_KINDS.join(", ")}).`,
  outbox_kind_forbidden: `Only the coordinator posts ${COORDINATOR_ONLY_KINDS.join(", ")}; ask it with kind: question.`,
  outbox_recipient_invalid: `to: lists up to ${MAX_RECIPIENTS} seat ids from the roster, "${TO_HUMAN}" or "${TO_ALL}", separated by commas, never yourself.`,
  outbox_empty: "The body after --- is empty: say what you found or need.",
  outbox_too_long: `The post is over ${MAX_COMMENT_CHARS} characters: put the detail on your own page in the repo and link it.`,
  outbox_post_failed: "GitHub refused the post or timed out, so it was not posted: send that block again.",
};

/** Why a mission action the user clicked (start, claim, accept, …) did not happen. */
export const MISSION_ACTION_ERRORS = [
  "project_not_found",
  "manifest_invalid",
  "not_a_mission",
  "manifest_changed",
  "mission_closed",
  "seat_unknown",
  "seat_taken",
  "seat_held_here",
  "seat_wrong_os",
  "branch_missing",
  "not_lead",
  "not_seated",
  "ask_not_found",
  "claim_not_found",
  "worktree_failed",
] as const;
export type MissionActionError = (typeof MISSION_ACTION_ERRORS)[number];
export const isMissionActionError = (v: unknown): v is MissionActionError =>
  typeof v === "string" && (MISSION_ACTION_ERRORS as readonly string[]).includes(v);

export const MISSION_ACTION_REMEDIATION: Record<MissionActionError, string> = {
  project_not_found: "Open the mission from a project that has a folder on this device.",
  manifest_invalid: "Every mission needs a coordinator seat, unique seat ids and a positive budget.",
  not_a_mission: "That PR is not an Agent Office mission hub (its body has no mission manifest).",
  manifest_changed: "The mission's seats, agents or goal changed since you looked: reopen Join and read them again before claiming.",
  mission_closed: "The mission was closed by its lead; start a new one.",
  seat_unknown: "That seat is not in the mission's manifest.",
  seat_taken: "Another device already holds that seat.",
  seat_held_here: "This device already claimed that seat: open its chat.",
  seat_wrong_os: "That seat needs a different operating system: claim it from that device.",
  branch_missing: "The hub branch is not on the remote yet: wait for the lead to push it.",
  not_lead: "Only the device that started the mission can do that.",
  not_seated: "This device holds no accepted seat in the mission.",
  ask_not_found: "That question was answered already, or is not addressed to you.",
  claim_not_found: "That claim was accepted or rejected already.",
  worktree_failed: "Git could not create the seat's worktree: check the project's folder and its GitHub account.",
};

export const SEAT_OS = ["any", "win32", "darwin", "linux"] as const;
export type SeatOs = (typeof SEAT_OS)[number];
export const isSeatOs = (v: unknown): v is SeatOs => typeof v === "string" && (SEAT_OS as readonly string[]).includes(v);

export const MISSION_ACTION_STATUS: Record<MissionActionError, number> = {
  project_not_found: 404,
  manifest_invalid: 400,
  not_a_mission: 404,
  manifest_changed: 409,
  mission_closed: 409,
  seat_unknown: 404,
  seat_taken: 409,
  seat_held_here: 409,
  seat_wrong_os: 409,
  branch_missing: 409,
  not_lead: 403,
  not_seated: 403,
  ask_not_found: 404,
  claim_not_found: 404,
  worktree_failed: 500,
};
