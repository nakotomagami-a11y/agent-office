import { z } from "zod";
import { match } from "ts-pattern";
import { RUN_ERROR_CODES } from "@agent-office/domain/config/run-errors";
import type { RunStreamEvent } from "@agent-office/domain/types";
import type { SubAgentStatus, ThreadItem, UsageMeter } from "./thread-types";

export interface ApplyResult {
  thread: ThreadItem[];
  usage: UsageMeter;
  done: boolean;
  error: string | null;
  sessionId?: string;
  startTs?: number;
}

const attachedSchema = z.object({
  runId: z.string(),
  output: z.string(),
  tokensIn: z.number(),
  tokensOut: z.number(),
  cost: z.number(),
  status: z.enum(["running", "done", "error"]),
  startTs: z.number(),
});

const chunkSchema = z.object({ runId: z.string(), text: z.string() });
const toolSchema = z.object({ runId: z.string(), name: z.string(), input: z.unknown().optional() });
const usageSchema = z.object({
  runId: z.string(),
  tokensIn: z.number(),
  tokensOut: z.number(),
  cost: z.number(),
});
const doneSchema = z.object({
  runId: z.string(),
  exitCode: z.number(),
  sessionId: z.string().optional(),
  durationMs: z.number().optional(),
  tokensIn: z.number().optional(),
  tokensOut: z.number().optional(),
  cost: z.number().optional(),
});
const errorSchema = z.object({ runId: z.string(), code: z.enum(RUN_ERROR_CODES), detail: z.string().optional(), interrupted: z.boolean().optional() });
const rateLimitSchema = z.object({ runId: z.string(), message: z.string(), resetsAt: z.number().optional(), severity: z.enum(["warning", "limit"]).default("limit") });

const subAgentStatusSchema = z.enum(["queued", "running", "cancelling", "done", "error", "cancelled", "timeout"]);

const subagentSchema = z.object({
  type: z.literal("subagent"),
  parentRunId: z.string(),
  subRunId: z.string(),
  agentId: z.string(),
  prompt: z.string(),
  status: subAgentStatusSchema,
});

const subagentUpdateSchema = z.object({
  type: z.literal("subagent-update"),
  subRunId: z.string(),
  status: subAgentStatusSchema,
  currentTool: z.string().optional(),
  tokensIn: z.number(),
  tokensOut: z.number(),
  cost: z.number(),
  lastOutputLine: z.string().optional(),
});

const eventSchemas = {
  attached: attachedSchema,
  chunk: chunkSchema,
  tool: toolSchema,
  usage: usageSchema,
  done: doneSchema,
  error: errorSchema,
  "rate-limit": rateLimitSchema,
  subagent: subagentSchema,
  "subagent-update": subagentUpdateSchema,
} as const;

export type SseEventName = keyof typeof eventSchemas;

export function isSseEventName(name: string): name is SseEventName {
  return name in eventSchemas;
}

export function parseSseEvent(name: string, raw: unknown): RunStreamEvent | null {
  if (!isSseEventName(name)) return null;
  const result = eventSchemas[name].safeParse(raw);
  if (!result.success) {
    if (typeof console !== "undefined") {
      console.warn("sse.invalid_payload", { event: name, issues: result.error.issues });
    }
    return null;
  }
  return { name, data: result.data } as RunStreamEvent;
}

export function applySseEvent(
  prev: { thread: ThreadItem[]; usage: UsageMeter; startTs?: number | null },
  event: RunStreamEvent,
): ApplyResult {
  return match(event)
    .with({ name: "attached" }, ({ data }) => {
      const next: ThreadItem[] = [...prev.thread];
      if (data.output && data.output.length > 0 && next.length === 0) {
        next.push({ kind: "agent-text", id: newId(), text: data.output, streaming: data.status === "running" });
      }
      return {
        thread: next,
        usage: { tokensIn: data.tokensIn, tokensOut: data.tokensOut, cost: data.cost },
        done: data.status === "done" || data.status === "error",
        error: null,
        startTs: data.startTs,
      };
    })
    .with({ name: "chunk" }, ({ data }) => ({
      thread: appendTextChunk(prev.thread, data.text),
      usage: prev.usage,
      done: false,
      error: null,
    }))
    .with({ name: "tool" }, ({ data }) => {
      // Sub-agent spawns get their own card via the dedicated `subagent` event,
      // so suppress the raw tool card here to avoid a duplicate. Covers native
      // Task/Agent tools and Bash `claude -p --agent` spawns, and both the empty
      // content_block_start fire and the full assistant fire.
      if (isSubAgentSpawnTool(data.name, data.input)) {
        return { thread: prev.thread, usage: prev.usage, done: false, error: null };
      }
      return {
        thread: closeStreaming([
          ...prev.thread,
          { kind: "agent-tool" as const, id: newId(), name: data.name, arg: formatToolArg(data.input) },
        ]),
        usage: prev.usage,
        done: false,
        error: null,
      };
    })
    .with({ name: "subagent" }, ({ data }) => {
      // Find the most recent agent-subagent item without a subRunId (created by the tool event)
      // and attach the subRunId to it, or create a new one if not found.
      const thread = [...prev.thread];
      let existingIdx = -1;
      for (let i = thread.length - 1; i >= 0; i--) {
        const it = thread[i]!;
        if (it.kind === "agent-subagent" && !it.subRunId && it.status === "running") {
          existingIdx = i;
          break;
        }
      }
      if (existingIdx !== -1) {
        const existing = thread[existingIdx]!;
        if (existing.kind === "agent-subagent") {
          thread[existingIdx] = { ...existing, subRunId: data.subRunId, status: data.status as SubAgentStatus };
        }
      } else {
        thread.push({
          kind: "agent-subagent" as const,
          id: newId(),
          name: data.agentId,
          prompt: data.prompt,
          status: data.status as SubAgentStatus,
          startTs: Date.now(),
          subRunId: data.subRunId,
        });
      }
      return { thread, usage: prev.usage, done: false, error: null };
    })
    .with({ name: "subagent-update" }, ({ data }) => {
      const thread = prev.thread.map((it) => {
        if (it.kind !== "agent-subagent" || it.subRunId !== data.subRunId) return it;
        const now = Date.now();
        const durationMs =
          data.status !== "running" && data.status !== "queued" && data.status !== "cancelling"
            ? now - it.startTs
            : it.durationMs;
        return {
          ...it,
          status: data.status as SubAgentStatus,
          currentTool: data.currentTool,
          tokensIn: data.tokensIn,
          tokensOut: data.tokensOut,
          cost: data.cost,
          lastOutputLine: data.lastOutputLine,
          durationMs,
        };
      });
      return { thread, usage: prev.usage, done: false, error: null };
    })
    .with({ name: "usage" }, ({ data }) => ({
      thread: prev.thread,
      usage: { tokensIn: data.tokensIn, tokensOut: data.tokensOut, cost: data.cost },
      done: false,
      error: null,
    }))
    .with({ name: "done" }, ({ data }) => {
      const now = Date.now();
      const finalized = prev.thread.map((it) =>
        it.kind === "agent-subagent" && (it.status === "running" || it.status === "queued" || it.status === "cancelling")
          ? { ...it, status: "done" as SubAgentStatus, durationMs: now - it.startTs }
          : it,
      );
      // Use server-provided durationMs when available; fall back to client-side
      // calculation from startTs so offline / GC'd runs still show a duration.
      const durationMs = data.durationMs ?? (prev.startTs ? now - prev.startTs : undefined);
      // Use server-provided tokens when present, otherwise fall back to the
      // accumulated stream usage (may be 0 if the usage event never arrived).
      const tokensIn = data.tokensIn ?? prev.usage.tokensIn;
      const tokensOut = data.tokensOut ?? prev.usage.tokensOut;
      const cost = data.cost ?? prev.usage.cost;
      return {
        thread: closeStreaming([
          ...finalized,
          {
            kind: "system-done" as const,
            id: newId(),
            exitCode: data.exitCode,
            durationMs,
            tokensIn,
            tokensOut,
            cost,
          },
        ]),
        usage: { tokensIn, tokensOut, cost },
        done: true,
        error: null,
        sessionId: data.sessionId,
      };
    })
    .with({ name: "error" }, ({ data }) => {
      const now = Date.now();
      const finalized = prev.thread.map((it) =>
        it.kind === "agent-subagent" && (it.status === "running" || it.status === "queued" || it.status === "cancelling")
          ? { ...it, status: "error" as SubAgentStatus, durationMs: now - it.startTs }
          : it,
      );
      return {
        thread: closeStreaming([...finalized, { kind: "system-error" as const, id: newId(), code: data.code, detail: data.detail, interrupted: data.interrupted }]),
        usage: prev.usage,
        done: false,
        error: data.detail ?? data.code,
      };
    })
    .with({ name: "rate-limit" }, ({ data }) => ({
      thread: closeStreaming([...prev.thread, { kind: "system-rate-limit" as const, id: newId(), message: data.message, resetsAt: data.resetsAt, severity: data.severity }]),
      usage: prev.usage,
      done: false,
      error: null,
    }))
    .exhaustive();
}

const newId = (): string => `i_${Math.random().toString(36).slice(2, 10)}`;

function appendTextChunk(thread: ThreadItem[], text: string): ThreadItem[] {
  const last = thread[thread.length - 1];
  if (last && last.kind === "agent-text" && last.streaming) {
    const updated: ThreadItem = { ...last, text: last.text + text };
    return [...thread.slice(0, -1), updated];
  }
  return [...thread, { kind: "agent-text", id: newId(), text, streaming: true }];
}

function closeStreaming(thread: ThreadItem[]): ThreadItem[] {
  return thread.map((it) =>
    it.kind === "agent-text" && it.streaming ? { ...it, streaming: false } : it,
  );
}

const SPAWN_TOOL_NAMES = new Set(["Task", "Agent"]);

/**
 * Client mirror of the server's `detectSubAgentSpawn` predicate. Kept local
 * because the server helper pulls in node-only deps. Matches native Task/Agent
 * tools (by name or `subagent_type` / `description`+`prompt` shape) and Bash
 * `claude -p --agent` spawns.
 */
function isSubAgentSpawnTool(name: string, input: unknown): boolean {
  if (SPAWN_TOOL_NAMES.has(name)) return true;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    if (typeof obj.subagent_type === "string") return true;
    if (typeof obj.description === "string" && typeof obj.prompt === "string") return true;
    if (name === "Bash" && typeof obj.command === "string" && isClaudeBashSpawn(obj.command)) return true;
  }
  return false;
}

function isClaudeBashSpawn(command: string): boolean {
  return (
    /(^|[\s;&|(])claude(\s|$)/.test(command) &&
    /(^|\s)(-p|--print)(\s|=|$)/.test(command) &&
    /--agent(\s|=)/.test(command)
  );
}

function formatToolArg(input: unknown): string | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input === "string") {
    return input.trim().length > 0 ? input : undefined;
  }
  if (typeof input === "object") {
    // Empty objects / arrays carry no information - rendering `{}` next to
    // every tool name just adds visual noise without helping the user
    // understand the call. Drop them here so the UI layer doesn't have to.
    const empty = Array.isArray(input)
      ? input.length === 0
      : Object.keys(input as Record<string, unknown>).length === 0;
    if (empty) return undefined;
  }
  try {
    // Keep the full payload - the tool-card header truncates via CSS ellipsis,
    // and the expanded body needs the complete value to be useful.
    return JSON.stringify(input);
  } catch {
    return undefined;
  }
}
