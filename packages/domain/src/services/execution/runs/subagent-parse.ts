// Pure detection/parsing for sub-agent spawns. No run state — given a tool call
// (or Bash command), decide whether it spawned a sub-agent and extract the
// child agent id + prompt. The stateful record-keeping lives in the core.

function extractTaskPrompt(input: unknown): string {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    if (typeof obj.prompt === "string") return obj.prompt.trim();
    if (typeof obj.description === "string") return obj.description.trim();
  }
  if (typeof input === "string") return input.trim();
  return JSON.stringify(input);
}

function extractChildAgentId(input: unknown, fallback: string): string {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    if (typeof obj.subagent_type === "string" && obj.subagent_type) return obj.subagent_type;
  }
  return fallback;
}

/** Tool names that always denote a sub-agent spawn in the current Claude CLI. */
const SUB_AGENT_TOOL_NAMES = new Set(["Task", "Agent"]);

/**
 * Single source of truth for "did this tool call spawn a sub-agent?". Matches
 * three summon styles so a card is created in exactly one place:
 *   1. Native Task/Agent tool (known name, or structural `subagent_type` /
 *      `description`+`prompt` shape so it survives future tool renames).
 *   2. Bash `claude -p --agent <id> "<prompt>"` spawns.
 * Returns the resolved child agent id + prompt, or null when it is an ordinary
 * tool call.
 */
export function detectSubAgentSpawn(
  toolName: string,
  input: unknown,
  fallbackAgentId: string,
): { agentId: string; prompt: string } | null {
  const obj =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : null;

  const structural =
    !!obj &&
    (typeof obj.subagent_type === "string" ||
      (typeof obj.description === "string" && typeof obj.prompt === "string"));

  if (SUB_AGENT_TOOL_NAMES.has(toolName) || structural) {
    return {
      agentId: extractChildAgentId(input, fallbackAgentId),
      prompt: extractTaskPrompt(input),
    };
  }

  if (toolName === "Bash" && obj && typeof obj.command === "string") {
    const parsed = parseClaudeBashSpawn(obj.command);
    if (parsed) {
      return { agentId: parsed.agentId ?? fallbackAgentId, prompt: parsed.prompt };
    }
  }

  return null;
}

/**
 * Parse a Bash command that shells out to the Claude CLI in non-interactive
 * print mode (`claude -p` / `--print`) with an `--agent <id>`. Returns null for
 * any Bash command that is not such a spawn.
 */
export function parseClaudeBashSpawn(
  command: string,
): { agentId?: string; prompt: string } | null {
  if (!/(^|[\s;&|(])claude(\s|$)/.test(command)) return null;
  if (!/(^|\s)(-p|--print)(\s|=|$)/.test(command)) return null;

  const agentMatch = command.match(/--agent(?:\s+|=)(?:"([^"]+)"|'([^']+)'|(\S+))/);
  const agentId = agentMatch ? (agentMatch[1] ?? agentMatch[2] ?? agentMatch[3]) : undefined;

  return { agentId, prompt: extractBashPrompt(command) };
}

function extractBashPrompt(command: string): string {
  const pFlag = command.match(/(?:-p|--print)(?:\s+|=)(?:"([^"]*)"|'([^']*)')/);
  if (pFlag) return (pFlag[1] ?? pFlag[2] ?? "").trim();
  // Otherwise the last quoted string in the command is usually the prompt.
  const quotes = [...command.matchAll(/"([^"]*)"|'([^']*)'/g)];
  const last = quotes.at(-1);
  if (last) return (last[1] ?? last[2] ?? "").trim();
  return command.trim();
}

/** Flatten a tool_result `content` (string | array of parts | object) to text. */
export function stringifyToolResult(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return typeof part === "string" ? part : "";
      })
      .join("");
  }
  if (content == null) return "";
  return typeof content === "object" ? JSON.stringify(content) : String(content);
}
