// Single source of truth for date/time *display*. Built on the platform `Intl`
// API — no date library needed (timestamps are stored as epoch millis; this only
// formats them). Prefer these over ad-hoc `new Date(ms).toLocaleString(...)` so the
// app renders dates consistently.
//
// Intl.DateTimeFormat instances are relatively expensive to construct, so cache
// them by option shape. `.format()` accepts either epoch millis or a Date.

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat([], opts);
    cache.set(key, f);
  }
  return f;
}

/** "Jan 15, 10:30 AM" — month/day + time, no year. */
export function formatDateTime(value: number | Date): string {
  return formatter({ month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(value);
}

/** "Jan 15, 2024, 10:30 AM" — full date + time with year. */
export function formatDateTimeYear(value: number | Date): string {
  return formatter({
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

/** "Mon, 10:30 AM" — weekday + time. */
export function formatWeekdayTime(value: number | Date): string {
  return formatter({ weekday: "short", hour: "2-digit", minute: "2-digit" }).format(value);
}

/** "10:30:45 AM" — locale time only. */
export function formatTime(value: number | Date): string {
  return formatter({ hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value);
}

/** "just now" / "5m ago" / "3h ago" / "2d ago". */
export function formatRelative(value: number | Date): string {
  const ms = typeof value === "number" ? value : value.getTime();
  const m = Math.round((Date.now() - ms) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** "Today" / "Yesterday" / "Jan 15, 2024". */
export function formatDayLabel(value: number | Date): string {
  const d = typeof value === "number" ? new Date(value) : value;
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return formatter({ month: "short", day: "numeric", year: "numeric" }).format(d);
}
