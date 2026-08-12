function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const POLL = {
  RUNS: envInt("NEXT_PUBLIC_POLL_RUNS", 5_000),
  HEALTH: envInt("NEXT_PUBLIC_POLL_HEALTH", 30_000),
  SKILLS_UPDATES: envInt("NEXT_PUBLIC_POLL_SKILLS_UPDATES", 60_000),
} as const;
