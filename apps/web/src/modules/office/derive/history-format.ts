// Presentation helpers for the agent History tab. Pure, no React.

import type { PersistedRun } from "@agent-office/domain/types";

// Relative time + day labels are shared app-wide — see @/lib/format-date.
export { formatRelative as formatRelativeTime, formatDayLabel } from "@/lib/format-date";

export function formatHistoryDuration(ms: number): string {
  if (!ms) return "-";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function runTokens(r: PersistedRun): number {
  return (r.tokensIn || 0) + (r.tokensOut || 0);
}
