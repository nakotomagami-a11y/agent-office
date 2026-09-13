// Pure formatting helpers shared by the two `HoverCard`-based quick-view
// cards (`agent-quick-view.tsx`'s roster card, `project-quick-view.tsx`'s
// tab card). No app-wide equivalent existed for these when they were first
// written — kept together here instead of duplicated a second time now that
// a second consumer needs them.

import type { PersistedRun } from "@agent-office/domain/types";

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** The last non-empty line of a run's output (falling back to its prompt) —
 *  a one-line "what happened" summary for a finished/live run. */
export function lastLineOf(run: PersistedRun): string {
  const text = (run.output || run.prompt || "").trim();
  if (!text) return run.prompt ?? "";
  const lines = text.split("\n");
  return lines[lines.length - 1]?.trim() || run.prompt || "";
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function formatTokensShort(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
}
