/**
 * Human-readable countdown formatter for the rate-limit card:
 *   >1h → "Xh Ym", >1m → "Xm Ys", otherwise "Xs"
 */
export function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
