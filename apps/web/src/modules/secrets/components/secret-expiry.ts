export type Expiry = "never" | "30" | "90" | "365" | "date";

export const EXPIRY_OPTIONS: Array<[Expiry, string]> = [
  ["never", "Never"],
  ["30", "30 days"],
  ["90", "90 days"],
  ["365", "1 year"],
  ["date", "Pick date"],
];

export const DAY = 86_400_000;

export function expiryMs(expiry: Expiry, date: string): number | null {
  if (expiry === "never") return null;
  if (expiry === "date") return date ? new Date(date + "T00:00:00").getTime() : null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + Number(expiry));
  return d.getTime();
}

export function formatWarnDate(ms: number): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}
