import type { ScheduledJob, ScheduleRepeat, ScheduleRepeatEvery } from "@agent-office/domain/types";

export function whenParts(ms: number): { abs: string; rel: string; future: boolean } {
  const d = new Date(ms);
  const diff = ms - Date.now();
  const mins = Math.round(Math.abs(diff) / 60_000);
  const mag =
    mins < 1 ? "now"
    : mins < 60 ? `${mins}m`
    : mins < 1440 ? `${Math.round(mins / 60)}h`
    : `${Math.round(mins / 1440)}d`;
  const abs = d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const future = diff >= 0;
  return { abs, rel: future ? (mins < 1 ? "firing now" : `in ${mag}`) : `${mag} ago`, future };
}

export const REPEAT_LABEL: Record<ScheduleRepeatEvery, string> = {
  hourly: "Every hour",
  daily: "Every day",
  weekdays: "Weekdays",
  weekly: "Every week",
};

export function repeatSummary({ every, anchorAt }: ScheduleRepeat): string {
  const d = new Date(anchorAt);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (every === "hourly") return `every hour at :${String(d.getMinutes()).padStart(2, "0")}`;
  if (every === "daily") return `every day at ${time}`;
  if (every === "weekdays") return `weekdays at ${time}`;
  return `every ${d.toLocaleDateString([], { weekday: "long" })} at ${time}`;
}

/** i18n message-key stem per attention reason — see `schedules.attention_*` in messages/en.json. */
export const ATTENTION_MSG_KEY: Record<NonNullable<ScheduledJob["attention"]>, "stale" | "missing_instance" | "retry_exceeded" | "bridge_missing" | "provider_unavailable"> = {
  stale: "stale",
  "missing-instance": "missing_instance",
  "retry-exceeded": "retry_exceeded",
  "bridge-missing": "bridge_missing",
  "provider-unavailable": "provider_unavailable",
};

/** What a row is called: its prompt, or the job label for a prompt-less summon. */
export const jobTitle = (job: ScheduledJob) => job.summonRequest.prompt || job.label;

export type ScheduleView = "upcoming" | "recurring" | "history";

/** Upcoming holds everything that will fire next, a series' next slot included; Recurring lists the series. */
export function groupJobs(jobs: ScheduledJob[]) {
  const live = jobs.filter((j) => j.status === "pending" || j.status === "firing").sort((a, b) => a.fireAt - b.fireAt);
  const groups = {
    attention: jobs.filter((j) => j.status === "needs-attention").sort((a, b) => a.fireAt - b.fireAt),
    upcoming: live,
    recurring: live.filter((j) => j.repeat),
    history: jobs.filter((j) => j.status === "done").sort((a, b) => shownAt(b) - shownAt(a)),
  };
  const counts: Record<ScheduleView, number> = {
    upcoming: groups.upcoming.length + groups.attention.length,
    recurring: groups.recurring.length,
    history: groups.history.length,
  };
  return { ...groups, counts };
}

/** When a row sits in the list: a finished job by when it ran ("run now" never moves `fireAt`). */
export function shownAt(job: ScheduledJob): number {
  return job.status === "done" ? job.updatedAt : job.fireAt;
}

/** "17:00" — the row's fixed-width time column, so always 24h. */
export function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

function dayStart(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function dayLabel(ms: number): string {
  const diff = Math.round((dayStart(ms) - dayStart(Date.now())) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (Math.abs(diff) < 7) return new Date(ms).toLocaleDateString([], { weekday: "long" });
  return new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });
}

export interface DayGroup<T> {
  key: number;
  label: string;
  date: string;
  items: T[];
}

export function groupByDay<T>(items: T[], at: (item: T) => number): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const key = dayStart(at(item));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({
      key,
      label: dayLabel(key),
      date: new Date(key).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
      items: [item],
    });
  }
  return groups;
}

export function scheduleSummary(upcoming: ScheduledJob[]): string {
  const next = upcoming.filter((j) => j.status === "pending").map((j) => j.fireAt).sort((a, b) => a - b)[0];
  const watchers = upcoming.filter((j) => j.reason === "rate-limit" && j.status === "pending").length;
  const repeating = upcoming.filter((j) => j.repeat).length;
  return [
    `${upcoming.length - repeating} queued`,
    next !== undefined ? `next fires ${whenParts(next).rel}` : null,
    watchers ? `${watchers} watcher${watchers === 1 ? "" : "s"} armed` : null,
    repeating ? `${repeating} repeating` : null,
  ].filter(Boolean).join(" · ");
}

const ERROR_COPY: Record<string, string> = {
  schedule_not_runnable: "it's already running or finished",
  schedule_not_reassignable: "it's running or already finished",
  repeat_with_rate_limit: "a rate-limit resume can't repeat",
  not_found: "it no longer exists",
};

/** Server error codes → copy (the client owns wording, see `errors.machine-codes`). */
export function scheduleErrorText(err: unknown): string {
  const code = err instanceof Error ? err.message : "";
  return Object.hasOwn(ERROR_COPY, code) ? ERROR_COPY[code]! : "something went wrong — try again";
}
