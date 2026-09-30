// Model alias/id lists now live in one place: `./models.ts` (MODEL_CATALOG is
// the source of truth for aliases, versioned ids, pricing, and display info).
// Re-exported here so existing `agent-opts` imports keep resolving.
export { MODEL_FULL, MODEL_OPTS } from "./models";

export const EFFORT_OPTS = ["low", "medium", "high", "xhigh", "max"] as const;

/**
 * Verified by EXECUTING each value on CLI v2.1.278 — `default` is accepted
 * even though the CLI's "Allowed choices" error text omits it. Re-verify on
 * upgrade: `claude -p ok --permission-mode "$m"` per mode, check exit 0.
 *
 * ADVISORY, NOT A CONTROL: the child shares our uid, and v2.1.278 never calls
 * `--permission-prompt-tool`. See docs/03-agents.md. `plan` is read-only.
 */
export const PERMISSION_MODE_OPTS = [
  "default",
  "bypassPermissions",
  "acceptEdits",
  "auto",
  "manual",
  "dontAsk",
  "plan",
] as const;
