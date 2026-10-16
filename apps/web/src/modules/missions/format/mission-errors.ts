import { MISSION_ACTION_ERRORS } from "@agent-office/domain/config/missions";
import { REVIEW_ERROR_CODES } from "@agent-office/domain/config/review";
import { ApiError } from "@/lib/api/fetch";

/** Codes a mission route answers with outside the two tables: its request plumbing, and this side's own. */
export const GENERIC_MISSION_ERRORS = [
  "forbidden",
  "validation_failed",
  "cap_over_budget",
  "invalid_json",
  "payload_too_large",
  "invalid_mission_id",
  "invalid_comment_id",
  "invalid_id",
  "project_required",
  "not_found",
  "network",
  "server",
  "unknown",
] as const;

/** Every key under `missions.errors` in messages/en.json. */
export const MISSION_ERROR_KEYS = [...MISSION_ACTION_ERRORS, ...REVIEW_ERROR_CODES, ...GENERIC_MISSION_ERRORS] as const;
export type MissionErrorKey = (typeof MISSION_ERROR_KEYS)[number];

const isKey = (v: unknown): v is MissionErrorKey => typeof v === "string" && (MISSION_ERROR_KEYS as readonly string[]).includes(v);

export interface MissionFailure {
  key: MissionErrorKey;
  /** The server's English remediation: shown only when `key` is `unknown`, i.e. a code this client predates. */
  hint: string | null;
  /** Raw context (gh's own message), never a sentence of ours. */
  detail: string | null;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

function fromStatus(status: number): MissionErrorKey {
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  return status >= 500 ? "server" : "unknown";
}

/** Why a mission request failed, as a message key. Never a raw code or a zod path for the user. */
export function missionFailure(e: unknown): MissionFailure {
  if (e instanceof ApiError) {
    const code = e.data?.error;
    const hint = str(e.data?.hint);
    const detail = str(e.data?.detail);
    if (code === "validation_failed" && Object.values(e.fields ?? {}).some((msgs) => msgs.includes("cap_over_budget"))) {
      return { key: "cap_over_budget", hint: null, detail: null };
    }
    if (isKey(code)) return { key: code, hint: null, detail };
    return { key: hint ? "unknown" : fromStatus(e.status), hint, detail };
  }
  // fetch rejects with a TypeError when the request never got an answer.
  if (e instanceof TypeError) return { key: "network", hint: null, detail: null };
  return { key: "unknown", hint: null, detail: null };
}
