// Time windows, slot labels and axis labels for the project Activity card.

export type ActivityRangeKey = "24h" | "7d" | "30d";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const ACTIVITY_RANGES: Record<ActivityRangeKey, { label: string; spendLabel: string; period: string }> = {
  "24h": { label: "24h", spendLabel: "Spend today", period: "day" },
  "7d": { label: "7 days", spendLabel: "Spend this week", period: "week" },
  "30d": { label: "30 days", spendLabel: "Spend this month", period: "month" },
};

export interface ActivityWindow {
  key: ActivityRangeKey;
  start: number;
  bucketMs: number;
  count: number;
  /** The bucket `now` falls in; later ones are still in the future. */
  nowIndex: number;
}

export function activityWindow(key: ActivityRangeKey, now: number): ActivityWindow {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const today = midnight.getTime();
  // Stepped back in fixed ms from today's midnight, not by calendar days: the server buckets in fixed
  // ms, so across a DST change only the older buckets drift by the hour, never today's.
  const shape =
    key === "24h" ? { start: today, bucketMs: 30 * MIN, count: 48 }
    : key === "7d" ? { start: today - 6 * DAY, bucketMs: 4 * HOUR, count: 42 }
    : { start: today - 29 * DAY, bucketMs: DAY, count: 30 };
  const nowIndex = Math.min(shape.count - 1, Math.floor((now - shape.start) / shape.bucketMs));
  return { key, ...shape, nowIndex };
}

const pad = (n: number) => String(n).padStart(2, "0");
const halfHour = (k: number) => `${pad(Math.floor(k / 2))}:${k % 2 ? "30" : "00"}`;
const weekday = (ts: number) => new Date(ts).toLocaleDateString("en-US", { weekday: "short" });
const monthDay = (ts: number) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function slotLabel(win: ActivityWindow, i: number): string {
  const from = win.start + i * win.bucketMs;
  if (win.key === "24h") return `${halfHour(i)}–${halfHour(i + 1)}`;
  if (win.key === "7d") {
    const to = new Date(from + win.bucketMs).getHours() || 24;
    return `${weekday(from + win.bucketMs / 2)} ${pad(new Date(from).getHours())}:00–${pad(to)}:00`;
  }
  return new Date(from + win.bucketMs / 2).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function slotAgo(win: ActivityWindow, i: number): string {
  const m = ((win.nowIndex - i) * win.bucketMs) / MIN;
  if (m === 0) return win.key === "30d" ? "today" : "now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round((m / 60) * 10) / 10}h ago`;
  const d = Math.round(m / 1440);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

export interface AxisLabel {
  label: string;
  now: boolean;
}

export function activityAxis(win: ActivityWindow, now: number): AxisLabel[] {
  if (win.key === "24h") {
    const d = new Date(now);
    const nowHours = d.getHours() + d.getMinutes() / 60;
    const marks = [0, 6, 12, 18, 24];
    // "now" takes the place of the nearest fixed mark so the row keeps five evenly spread labels.
    const nearest = marks.reduce((a, b) => (Math.abs(b - nowHours) < Math.abs(a - nowHours) ? b : a));
    return marks.map((h) =>
      h === nearest ? { label: `now · ${pad(d.getHours())}:${pad(d.getMinutes())}`, now: true } : { label: `${pad(h)}:00`, now: false },
    );
  }
  const dayStarts = win.key === "7d" ? [0, 1, 2, 3, 4, 5] : [0, 7, 14, 21];
  const fmt = win.key === "7d" ? weekday : monthDay;
  return [
    ...dayStarts.map((d) => ({ label: fmt(win.start + d * DAY + DAY / 2), now: false })),
    { label: "today", now: true },
  ];
}
