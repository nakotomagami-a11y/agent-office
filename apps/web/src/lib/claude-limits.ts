/**
 * `all` is an analytics-only window covering the entire run history. It is
 * NOT a valid quota-reset period — `parseLimits` never produces it, so a
 * persisted limits config can't accidentally disable the reset cycle.
 */
export type LimitsPeriod = "daily" | "week" | "month" | "all";
export type HardCap = "off" | "warn" | "block";

export interface ClaudeLimits {
  quotaUsd: number;
  period: LimitsPeriod;
  hardCap: HardCap;
}

const DEFAULTS: ClaudeLimits = { quotaUsd: 0, period: "week", hardCap: "warn" };

export function parseLimits(raw: string | null): ClaudeLimits {
  if (!raw) return DEFAULTS;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const period: LimitsPeriod =
      parsed.period === "month" ? "month" :
      parsed.period === "daily" ? "daily" :
      "week";
    const hardCap: HardCap =
      parsed.hardCap === "off" || parsed.hardCap === "warn" || parsed.hardCap === "block"
        ? (parsed.hardCap as HardCap)
        : DEFAULTS.hardCap;
    const quotaUsd =
      typeof parsed.quotaUsd === "number" && parsed.quotaUsd >= 0 ? parsed.quotaUsd : DEFAULTS.quotaUsd;
    return { quotaUsd, period, hardCap };
  } catch {
    return DEFAULTS;
  }
}

export function periodStart(period: LimitsPeriod, now = Date.now()): number {
  if (period === "all") return 0;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === "month") return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  if (period === "daily") return d.getTime();
  // week - start on Monday (ISO)
  const dow = d.getDay();
  const daysSinceMonday = (dow + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d.getTime();
}

/** End-of-period timestamp - exclusive upper bound for the current window. */
export function periodEnd(period: LimitsPeriod, now = Date.now()): number {
  if (period === "all") return Number.POSITIVE_INFINITY;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === "month") return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  if (period === "daily") {
    d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  return periodStart(period, now) + 7 * 86_400_000;
}
