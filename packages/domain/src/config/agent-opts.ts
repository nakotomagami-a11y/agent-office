// Model alias/id lists now live in one place: `./models.ts` (MODEL_CATALOG is
// the source of truth for aliases, versioned ids, pricing, and display info).
// Re-exported here so existing `agent-opts` imports keep resolving.
export { MODEL_FULL, MODEL_OPTS } from "./models";

export const EFFORT_OPTS = ["low", "medium", "high", "xhigh", "max"] as const;

/**
 * Real `claude --permission-mode` values, verified against CLI v2.1.278.
 *
 * All six are offered now that a live approval channel exists
 * (services/execution/permissions.ts + the MCP permission server): a mode that
 * can prompt is handed `--permission-prompt-tool`, so a headless `-p` run no
 * longer has to deny by default. Before that channel, `bypassPermissions` was
 * the only mode that let an agent finish unattended work — which was the
 * absence of a channel, not a security posture.
 *
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
