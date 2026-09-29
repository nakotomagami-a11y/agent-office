/**
 * Known Claude Code tool names. Agent frontmatter `tools:` is honoured by the
 * CLI (via `--agent`), never by this app — so a typo'd tool name silently
 * grants nothing, exactly like an unresolvable skill. This catalog exists so
 * the failure is detectable instead of invisible.
 *
 * MCP tools arrive as `mcp__<server>__<tool>` (often wildcarded) and are not
 * enumerable here, so they are matched by shape.
 *
 * Hand-maintained: there is no machine-readable source for the tool set. When
 * the CLI adds one, a legitimate name warns as unknown until this list is
 * updated — verify against `claude --help` / the current Claude Code docs. The
 * check is warn-only by design, so a stale entry is visible, never silent.
 */
export const KNOWN_TOOLS = [
  "Task",
  "Bash",
  "BashOutput",
  "KillShell",
  "Glob",
  "Grep",
  "Read",
  "Edit",
  "Write",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
  "TodoWrite",
  "SlashCommand",
  "ExitPlanMode",
] as const;

export type KnownTool = (typeof KNOWN_TOOLS)[number];

const MCP_TOOL = /^mcp__[A-Za-z0-9_-]+__[A-Za-z0-9_*-]+$/;

export function isKnownTool(name: string): boolean {
  return (KNOWN_TOOLS as readonly string[]).includes(name) || MCP_TOOL.test(name);
}

/** Declared tool names this app does not recognise. Empty = all valid. */
export function unknownTools(tools: string[]): string[] {
  return tools.filter((t) => t.trim() && !isKnownTool(t.trim()));
}
