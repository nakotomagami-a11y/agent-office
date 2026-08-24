// Cleanup-kind catalog — the reset operations exposed by /api/cleanup/<kind>.
// Runtime const + derived type + guard together (mirrors config/run-errors).
export const CLEANUP_KINDS = [
  "transcripts",
  "drafts",
  "orphaned-runs",
  "agent-memory",
  "user-analysis",
  "skill-cache",
  "ui-settings",
  "everything",
] as const;

export type CleanupKind = (typeof CLEANUP_KINDS)[number];

export function isCleanupKind(v: unknown): v is CleanupKind {
  return typeof v === "string" && (CLEANUP_KINDS as readonly string[]).includes(v);
}
