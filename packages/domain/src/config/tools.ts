/**
 * The Claude Code CLI's real tool vocabulary.
 *
 * Agent frontmatter `tools:` is honoured by the CLI (via `--agent`), never by
 * this app — so a name the CLI does not know is silently dropped and the agent
 * simply never gets that capability. This catalog exists so that failure is
 * detectable instead of invisible.
 *
 * VERIFIED EMPIRICALLY against CLI v2.1.278 by reading the `tools` array on the
 * `init` event of `claude -p --output-format stream-json --verbose`. That is the
 * authoritative list — do not add names from memory or from older docs.
 *
 *   claude -p --permission-mode bypassPermissions --model haiku \
 *     --output-format stream-json --verbose "ok" | head -1 | jq -r '.tools[]'
 *
 * Re-run that check when the CLI is upgraded; `KNOWN_TOOLS` is a snapshot, and a
 * stale snapshot produces false "unknown tool" warnings (visible, never silent).
 *
 * MCP tools arrive as `mcp__<server>__<tool>` (often wildcarded) and are not
 * enumerable here, so they are matched by shape.
 */
export const KNOWN_TOOLS = [
  "Bash",
  "CronCreate",
  "CronDelete",
  "CronList",
  "DesignSync",
  "Edit",
  "EnterWorktree",
  "ExitWorktree",
  "ListAgents",
  "Monitor",
  "NotebookEdit",
  "PushNotification",
  "Read",
  "RemoteTrigger",
  "ReportFindings",
  "ScheduleWakeup",
  "SendMessage",
  "Skill",
  "Task",
  "TaskCreate",
  "TaskGet",
  "TaskList",
  "TaskStop",
  "TaskUpdate",
  "ToolSearch",
  "WebFetch",
  "WebSearch",
  "Workflow",
  "Write",
] as const;

export type KnownTool = (typeof KNOWN_TOOLS)[number];

/**
 * Names that LOOK like tools, are widely declared across agent files, and do
 * NOT exist in the CLI — so declaring them grants nothing at all. Kept separate
 * from "unknown" so the warning can say *why* it is wrong and what replaced it.
 */
export const RETIRED_TOOLS: Record<string, string> = {
  Grep: "no equivalent — search via Bash (`grep`/`rg`)",
  Glob: "no equivalent — discover files via Bash (`find`/`ls`)",
  TodoWrite: "use TaskCreate / TaskUpdate / TaskList",
  TodoRead: "use TaskGet / TaskList",
  BashOutput: "use Monitor",
  KillShell: "use TaskStop",
  SlashCommand: "not exposed to agents",
  ExitPlanMode: "not exposed to agents",
};

const MCP_TOOL = /^mcp__[A-Za-z0-9_-]+__[A-Za-z0-9_*-]+$/;

export function isKnownTool(name: string): boolean {
  return (KNOWN_TOOLS as readonly string[]).includes(name) || MCP_TOOL.test(name);
}

/** Declared tool names the CLI does not provide. Empty = all are real. */
export function unknownTools(tools: string[]): string[] {
  return tools.filter((t) => t.trim() && !isKnownTool(t.trim()));
}

/** Declared names that are retired, with the replacement to use instead. */
export function retiredToolHints(tools: string[]): Array<{ tool: string; hint: string }> {
  return tools
    .map((t) => t.trim())
    .filter((t) => t in RETIRED_TOOLS)
    .map((t) => ({ tool: t, hint: RETIRED_TOOLS[t]! }));
}
