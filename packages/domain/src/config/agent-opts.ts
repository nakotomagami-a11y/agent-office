// Model alias/id lists now live in one place: `./models.ts` (MODEL_CATALOG is
// the source of truth for aliases, versioned ids, pricing, and display info).
// Re-exported here so existing `agent-opts` imports keep resolving.
export { MODEL_FULL, MODEL_OPTS } from "./models";

export const EFFORT_OPTS = ["low", "medium", "high", "xhigh", "max"] as const;

/**
 * Real `claude --permission-mode` values, verified against CLI v2.1.278.
 *
 * ADVISORY, NOT A CONTROL: the child shares our uid, and v2.1.278 never calls
 * `--permission-prompt-tool`. See docs/03-agents.md for the boundary.
 * `plan` is read-only and never needs a prompt at all.
 */
export const PERMISSION_MODE_OPTS = [
  "bypassPermissions",
  "acceptEdits",
  "auto",
  "manual",
  "dontAsk",
  "plan",
] as const;
