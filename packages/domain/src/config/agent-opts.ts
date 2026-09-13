// Model alias/id lists now live in one place: `./models.ts` (MODEL_CATALOG is
// the source of truth for aliases, versioned ids, pricing, and display info).
// Re-exported here so existing `agent-opts` imports keep resolving.
export { MODEL_FULL, MODEL_OPTS } from "./models";

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
