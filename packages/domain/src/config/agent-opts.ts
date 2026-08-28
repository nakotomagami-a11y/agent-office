// Alias → full versioned model ID. Update here when Anthropic releases new versions.
export const MODEL_FULL: Record<string, string> = {
  haiku:  "claude-haiku-4-5",
  sonnet: "claude-sonnet-4-6",
  opus:   "claude-opus-4-8",
  fable:  "claude-fable-5",
};

export const MODEL_OPTS = [
  "haiku",
  "sonnet",
  "opus",
  "fable",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-fable-5",
] as const;

export const EFFORT_OPTS = ["low", "medium", "high", "xhigh", "max"] as const;

/**
 * Real `claude --permission-mode` values. Every agent is summoned headless
 * via `claude -p` (see `services/execution/summon.ts`) with no interactive
 * TTY, so a tool call that would need a live prompt has nothing to prompt —
 * the CLI denies it outright. `bypassPermissions` is the only mode that
 * reliably lets an agent finish unattended work today, which is why all
 * bundled agents ship with it. `default` still denies unattended prompts
 * (no live approval channel exists yet — tracked in
 * docs/redesign-v3/REDESIGN_V3_PLAN.md); `plan` is a real read-only mode
 * that never needs a prompt at all, so it works headless by construction.
 */
export const PERMISSION_MODE_OPTS = ["bypassPermissions", "default", "plan"] as const;
