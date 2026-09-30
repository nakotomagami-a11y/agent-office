// Model alias/id lists now live in one place: `./models.ts` (MODEL_CATALOG is
// the source of truth for aliases, versioned ids, pricing, and display info).
// Re-exported here so existing `agent-opts` imports keep resolving.
export { MODEL_FULL, MODEL_OPTS } from "./models";

export const EFFORT_OPTS = ["low", "medium", "high", "xhigh", "max"] as const;

/**
 * The oracle is the flag's own enum inside the CLI binary, NOT its help text:
 * the "Allowed choices" error renames `default` to `manual` for display, which
 * is why executing values alone cannot tell a mode from an alias.
 *   strings $(which claude) | grep -o 'z.enum(\["default".*\])'
 *
 * ADVISORY, NOT A CONTROL: the child shares our uid, so it reads our argv and
 * /proc/<pid>/environ. Prompting modes are also unproven end-to-end — one
 * probe saw no `tools/call`, cause not isolated. See docs/03-agents.md.
 */
export const PERMISSION_MODE_OPTS = [
  "default",
  "acceptEdits",
  "bypassPermissions",
  "plan",
  "dontAsk",
  "auto",
] as const;

/** `manual` is the CLI's DISPLAY name for `default`, not a seventh mode —
 *  the binary maps `e === "manual" ? "default"` and its help says so. Accepted
 *  on input so existing configs keep working. */
export const PERMISSION_MODE_ALIASES: Record<string, (typeof PERMISSION_MODE_OPTS)[number]> = {
  manual: "default",
};
