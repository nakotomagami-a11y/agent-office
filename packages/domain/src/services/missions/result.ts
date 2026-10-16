// How a mission action reports back: a value, or a machine code with its HTTP status (the
// Result pattern, docs/architecture.md) — whether it failed in the mission rules or in gh.
import { ZodError } from "zod";
import { MISSION_ACTION_STATUS, type MissionActionError } from "../../config/missions";
import type { ReviewErrorCode } from "../../config/review";
import { emitAppEvent } from "../infra/events";
import { ReviewError } from "../review/gh";
import { fail } from "../review/pulls";

export type MissionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: MissionActionError | ReviewErrorCode; status: number; detail?: string };

export class ActionError extends Error {
  constructor(readonly code: MissionActionError, readonly detail?: string) {
    super(code);
  }
}

export async function run<T>(fn: () => Promise<T>): Promise<MissionResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (err instanceof ActionError) return { ok: false, error: err.code, status: MISSION_ACTION_STATUS[err.code], detail: err.detail };
    if (err instanceof ReviewError) {
      const r = fail<T>(err.code, err.detail);
      return { ok: false, error: err.code, status: r.ok ? 500 : r.status, detail: err.detail };
    }
    // gh printed something other than what hub.ts expects: a gh problem, not a crash (review/pulls.ts does the same).
    if (err instanceof ZodError || err instanceof SyntaxError) {
      const r = fail<T>("gh_failed", err.message.slice(0, 200));
      return { ok: false, error: "gh_failed", status: r.ok ? 500 : r.status, detail: err.message.slice(0, 200) };
    }
    throw err;
  }
}

export function refused<T>(code: MissionActionError, detail?: string): MissionResult<T> {
  return { ok: false, error: code, status: MISSION_ACTION_STATUS[code], detail };
}

/** A mutation the UI must see at once, not on the poller's next tick. */
export async function change<T>(fn: () => Promise<T>): Promise<MissionResult<T>> {
  const r = await run(fn);
  if (r.ok) emitAppEvent("missions:changed");
  return r;
}
