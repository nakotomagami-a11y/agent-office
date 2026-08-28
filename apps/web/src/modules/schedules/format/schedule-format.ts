import type { ScheduledJob } from "@agent-office/domain/types";

export function whenParts(ms: number): { abs: string; rel: string; future: boolean } {
  const d = new Date(ms);
  const diff = ms - Date.now();
  const mins = Math.round(Math.abs(diff) / 60_000);
  const mag =
    mins < 1 ? "now"
    : mins < 60 ? `${mins}m`
    : mins < 1440 ? `${Math.round(mins / 60)}h`
    : `${Math.round(mins / 1440)}d`;
  const abs = d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const future = diff >= 0;
  return { abs, rel: future ? (mins < 1 ? "firing now" : `in ${mag}`) : `${mag} ago`, future };
}

/** i18n message-key stem per attention reason — see `schedules.attention_*` in messages/en.json. */
export const ATTENTION_MSG_KEY: Record<NonNullable<ScheduledJob["attention"]>, "stale" | "missing_instance" | "retry_exceeded"> = {
  stale: "stale",
  "missing-instance": "missing_instance",
  "retry-exceeded": "retry_exceeded",
};
