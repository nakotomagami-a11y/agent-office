// Pure detection/parsing for sub-agent spawns. No run state — given a tool call
// (or Bash command), decide whether it spawned a sub-agent and extract the
// child agent id + prompt. The stateful record-keeping lives in the core.

import type { SubAgentStatus } from "../../../types/index";

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

/**
 * CLI >= 2.1.278 runs `Task` asynchronously: the spawn's `tool_result` is a
 * launch receipt, not the sub-agent's work — treating it as terminal settles
 * every child card in milliseconds with boilerplate as its output. The real
 * outcome arrives later on `system/task_notification`.
 *
 * `is_backgrounded` on `task_started` is the better signal (protocol, not
 * prose); this text match covers the receipt arriving first.
 */
export function isAsyncTaskLaunchAck(resultText: string): boolean {
  return /^\s*Async agent launched successfully/.test(resultText);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === "string" && value ? value : undefined;
}

export interface TaskStarted {
  taskId: string;
  toolUseId?: string;
  subagentType?: string;
  backgrounded: boolean;
}

/** `system/task_started` — correlates a `tool_use` id to a CLI task id. */
export function parseTaskStarted(evt: unknown): TaskStarted | null {
  const obj = asRecord(evt);
  if (!obj || obj.type !== "system" || obj.subtype !== "task_started") return null;
  const taskId = str(obj, "task_id");
  if (!taskId) return null;
  return {
    taskId,
    toolUseId: str(obj, "tool_use_id"),
    subagentType: str(obj, "subagent_type"),
    backgrounded: obj.is_backgrounded === true,
  };
}

export interface TaskCompletion {
  taskId: string;
  toolUseId?: string;
  status: SubAgentStatus;
  summary?: string;
  durationMs?: number;
  outputFile?: string;
}

const TERMINAL_TASK_STATUS: Record<string, SubAgentStatus> = {
  completed: "done",
  cancelled: "cancelled",
  canceled: "cancelled",
  timeout: "timeout",
  timed_out: "timeout",
};

/** A notification carrying one of these is progress, not completion. */
const PENDING_TASK_STATUS = new Set(["running", "pending", "queued", "in_progress"]);

/**
 * `system/task_notification` — the only real completion signal for an async
 * sub-agent. An unrecognised status maps to `error`, never `done`: claiming a
 * success we cannot verify is the worse failure.
 */
export function parseTaskNotification(evt: unknown): TaskCompletion | null {
  const obj = asRecord(evt);
  if (!obj || obj.type !== "system" || obj.subtype !== "task_notification") return null;
  const taskId = str(obj, "task_id");
  if (!taskId) return null;

  const raw = str(obj, "status");
  if (raw && PENDING_TASK_STATUS.has(raw)) return null;

  const usage = asRecord(obj.usage);
  const durationMs = typeof usage?.duration_ms === "number" ? usage.duration_ms : undefined;

  return {
    taskId,
    toolUseId: str(obj, "tool_use_id"),
    status: (raw ? TERMINAL_TASK_STATUS[raw] : undefined) ?? "error",
    summary: str(obj, "summary"),
    durationMs,
    outputFile: str(obj, "output_file"),
  };
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
