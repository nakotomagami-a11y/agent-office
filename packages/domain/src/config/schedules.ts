/** How often a recurring order repeats. The single source for the type, the API enum and the UI picker. */
export const SCHEDULE_REPEAT_EVERY = ["hourly", "daily", "weekdays", "weekly"] as const;
export type ScheduleRepeatEvery = (typeof SCHEDULE_REPEAT_EVERY)[number];

/** Jobs more than this overdue don't auto-fire — they wait for the user. */
export const SCHEDULE_STALE_HOURS = 12;
/** Consecutive rate-limit reschedules before a job gives up and needs attention. */
export const SCHEDULE_MAX_ATTEMPTS = 5;
