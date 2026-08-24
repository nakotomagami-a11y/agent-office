/**
 * Parse a reset time out of a Claude limit error such as
 * `You've hit your session limit · resets 10:10pm (Africa/Cairo)`.
 * Returns the next occurrence of that wall-clock time in the named IANA
 * timezone as epoch ms, or undefined if no reset time is present.
 */
export function parseResetTimeFromMessage(message: string, now: Date = new Date()): number | undefined {
  const m = /resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:\(([^)]+)\))?/i.exec(message);
  if (!m) return undefined;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const ampm = m[3]?.toLowerCase();
  const tz = m[4]?.trim();
  if (hour > 23 || minute > 59) return undefined;
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  return nextWallClockInZone(hour, minute, tz, now);
}

/** Next epoch-ms at which `hour:minute` occurs in `tz` (local time if tz omitted/invalid). */
function nextWallClockInZone(hour: number, minute: number, tz: string | undefined, now: Date): number | undefined {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    const parts = new Map<string, string>(fmt.formatToParts(now).map((x) => [x.type, x.value]));
    const get = (t: string): number => Number(parts.get(t) ?? "0");
    const y = get("year"), mo = get("month"), d = get("day");
    const nowHour = get("hour") === 24 ? 0 : get("hour");
    // Offset = (tz wall clock read as if it were UTC) − actual UTC now.
    const asUtc = Date.UTC(y, mo - 1, d, nowHour, get("minute"), get("second"));
    const offset = asUtc - now.getTime();
    let target = Date.UTC(y, mo - 1, d, hour, minute, 0) - offset;
    if (target <= now.getTime()) target += 24 * 60 * 60 * 1000;
    return target;
  } catch {
    return undefined; // invalid tz → let caller fall back
  }
}
