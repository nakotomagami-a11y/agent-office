import type { ScheduleRepeat } from "../../types/index";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The series' first slot strictly after `after`, in the server's local time. Each slot is
 *  rebuilt from the anchor's fields: stepping one Date would keep the hour a DST gap moved it to. */
export function nextOccurrence(repeat: ScheduleRepeat, after: number): number {
  const { every, anchorAt } = repeat;
  if (every === "hourly") return anchorAt + Math.max(0, Math.floor((after - anchorAt) / HOUR_MS) + 1) * HOUR_MS;
  const a = new Date(anchorAt);
  const step = every === "weekly" ? 7 : 1;
  const slot = (k: number) => new Date(a.getFullYear(), a.getMonth(), a.getDate() + k * step,
    a.getHours(), a.getMinutes(), a.getSeconds(), a.getMilliseconds());
  let k = Math.max(0, Math.floor((after - anchorAt) / (step * DAY_MS)) - 1);
  let t = slot(k);
  while (t.getTime() <= after || (every === "weekdays" && (t.getDay() === 0 || t.getDay() === 6))) t = slot(++k);
  return t.getTime();
}
