// Shared shaping for a tool call's thread row.
//
// Two paths produce these rows: the live SSE stream (`parse-sse-event.ts`) and
// the rebuild from persisted turns (`conversation-to-thread.ts`). They had
// drifted — live formatted the arg and suppressed sub-agent spawns, the rebuild
// did neither — so the same call rendered differently before and after a run
// finished, which is what made the thread jump. Both now call these.

const SPAWN_TOOL_NAMES = new Set(["Task", "Agent"]);

function isClaudeBashSpawn(command: string): boolean {
  return (
    /(^|[\s;&|(])claude(\s|$)/.test(command) &&
    /(^|\s)(-p|--print)(\s|=|$)/.test(command) &&
    /--agent(\s|=)/.test(command)
  );
}

/**
 * True when this call spawned a sub-agent, which gets its own richer card from
 * the `subagent` event — rendering the raw tool row too would duplicate it.
 *
 * Mirrors `detectSubAgentSpawn` in the domain package rather than importing it:
 * that helper pulls in node-only deps.
 */
export function isSubAgentSpawnTool(name: string, input: unknown): boolean {
  if (SPAWN_TOOL_NAMES.has(name)) return true;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    if (typeof obj.subagent_type === "string") return true;
    if (typeof obj.description === "string" && typeof obj.prompt === "string") return true;
    if (name === "Bash" && typeof obj.command === "string" && isClaudeBashSpawn(obj.command)) return true;
  }
  return false;
}

/** Displayable arg, or undefined when there is nothing worth showing. */
export function formatToolArg(input: unknown): string | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input === "string") {
    const t = input.trim();
    if (t.length === 0) return undefined;
    // Persisted rows store the input as a JSON string; the live path receives it
    // already parsed. Normalise so both render identically.
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        return formatToolArg(JSON.parse(t) as unknown);
      } catch {
        return input;
      }
    }
    return input;
  }
  if (typeof input === "object") {
    // `{}` next to every tool name is noise, not information.
    const empty = Array.isArray(input)
      ? input.length === 0
      : Object.keys(input as Record<string, unknown>).length === 0;
    if (empty) return undefined;
  }
  try {
    return JSON.stringify(input);
  } catch {
    return undefined;
  }
}

/** The arg a persisted row should display, parsing its stored JSON first. */
export function parseStoredToolInput(stored: string): unknown {
  const t = stored.trim();
  if (!t) return undefined;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return stored;
  }
}
