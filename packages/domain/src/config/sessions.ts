/** What to do with a session's work that no other branch holds, when the session is removed. */
export const WORK_CHOICES = ["keep", "discard"] as const;
export type WorkChoice = (typeof WORK_CHOICES)[number];

/** Why a session removal was refused (HTTP 409); the body lists the sessions concerned. */
export const SESSION_REMOVAL_CODES = ["session_running", "session_has_work", "worktree_remove_failed"] as const;
export type SessionRemovalCode = (typeof SESSION_REMOVAL_CODES)[number];
export const isSessionRemovalCode = (v: unknown): v is SessionRemovalCode =>
  typeof v === "string" && (SESSION_REMOVAL_CODES as readonly string[]).includes(v);
