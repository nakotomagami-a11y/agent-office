import type { PersistedRun } from "@agent-office/domain/types";

export function formatRelative(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export function formatCost(cost: number): string {
  if (cost === 0) return "$0";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${parseFloat((n / 1_000_000).toFixed(1))}M`;
  if (n >= 1_000) return `${parseFloat((n / 1_000).toFixed(1))}K`;
  return String(n);
}

export interface RunsByDay {
  day: string;
  runs: PersistedRun[];
}

export function groupRunsByDay(runs: PersistedRun[]): RunsByDay[] {
  const groups = new Map<string, PersistedRun[]>();
  for (const r of runs) {
    const date = new Date(r.ts);
    date.setHours(0, 0, 0, 0);
    const key = date.toISOString().slice(0, 10);
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = [];
      groups.set(key, bucket);
    }
    bucket.push(r);
  }
  return Array.from(groups.entries())
    .map(([day, items]) => ({ day, runs: items.sort((a, b) => b.ts - a.ts) }))
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}

export function dayLabel(isoDay: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(`${isoDay}T00:00:00`);
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return day.toLocaleDateString();
}
