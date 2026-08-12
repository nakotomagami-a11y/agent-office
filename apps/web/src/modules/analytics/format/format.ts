// Pure presentation helpers for the analytics page.

/** Money. Drops cents once the number is big enough that they're noise. */
export function usd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return "<$0.01";
  if (n < 100) return `$${n.toFixed(2)}`;
  if (n < 10_000) return `$${n.toFixed(0)}`;
  return `$${(n / 1000).toFixed(1)}k`;
}

/** Money with cents always — for per-run figures where they matter. */
export function usdPrecise(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function compact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Wall-clock duration from ms, at human granularity. */
export function duration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s)}s`;
  const m = s / 60;
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 100) return `${h.toFixed(1)}h`;
  return `${Math.round(h)}h`;
}

/** `+18%` / `−36%` / `—` when there's no baseline to compare against. */
export function delta(now: number, prev: number): { text: string; dir: "up" | "down" | "flat" } {
  if (prev === 0) return { text: now === 0 ? "—" : "new", dir: "flat" };
  const change = ((now - prev) / prev) * 100;
  if (Math.abs(change) < 0.5) return { text: "±0%", dir: "flat" };
  // Unicode minus reads better than a hyphen next to digits.
  const sign = change > 0 ? "+" : "−";
  return {
    text: `${sign}${Math.abs(change).toFixed(0)}%`,
    dir: change > 0 ? "up" : "down",
  };
}

/** `2026-07-13` → `Jul 13` */
export function shortDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const;

/**
 * Per-model fill *class* (see `.an-fill-*` in globals.css). Returns a class
 * rather than a colour so components never inline a token value.
 *
 * A small fixed set rather than a generated palette: these are the families
 * that actually show up, and giving Opus the warm "expensive" hue does real
 * work in the stacked spend bar.
 */
export function modelFillClass(family: string): string {
  switch (family) {
    case "opus":
      return "an-fill-opus";
    case "sonnet":
      return "an-fill-sonnet";
    case "haiku":
      return "an-fill-haiku";
    case "fable":
      return "an-fill-fable";
    default:
      return "an-fill-other";
  }
}

/**
 * `mcp__playwright__browser_evaluate` → `playwright · browser_evaluate`.
 * The raw ids are namespaced and overflow any sensible column width.
 */
export function toolLabel(raw: string): string {
  const m = raw.match(/^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/);
  if (m) return `${m[1]} · ${m[2]}`;
  return raw;
}
