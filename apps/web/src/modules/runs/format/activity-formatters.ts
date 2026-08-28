import type { PersistedRun } from "@agent-office/domain/types";

export function fmtTok(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

/**
 * Presentational-only "XP" for a run — a deterministic transform of its real
 * duration + token usage, not a persisted game economy (REDESIGN_V3_PLAN §D4:
 * relabel existing metrics, no schema change). Recomputed on every render.
 */
export function xpForRun(run: PersistedRun): number {
  const base = 10 + Math.round(run.durMs / 5000) + Math.round((run.tokensIn + run.tokensOut) / 500);
  return Math.min(999, base);
}

export function isoDay(ts: number): string {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function elapsedSince(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

export function todayIso(): string {
  return isoDay(Date.now());
}

export function yesterdayIso(): string {
  return isoDay(Date.now() - 86_400_000);
}

export interface Delta {
  text: string;
  cls: "" | "neg" | "flat";
}

export function formatDelta(cur: number, ref: number): Delta {
  if (ref === 0) return { text: "-", cls: "flat" };
  const pct = Math.round((100 * (cur - ref)) / ref);
  if (pct === 0) return { text: "no change vs yesterday", cls: "flat" };
  return {
    text: `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}% vs yesterday`,
    cls: pct > 0 ? "" : "neg",
  };
}
