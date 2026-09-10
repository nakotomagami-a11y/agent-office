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
  // Only used while a conversation is running/needs_attention/queued — see
  // use-conversation.ts. An idle conversation with an empty queue never
  // polls at all, so this only fires during real activity.
  CONVERSATION_ACTIVE: envInt("NEXT_PUBLIC_POLL_CONVERSATION_ACTIVE", 2_000),
} as const;
