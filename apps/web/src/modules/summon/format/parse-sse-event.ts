import { z } from "zod";
import { applyToolEvent, newId } from "./tool-item";
import { assertNever } from "@/lib/assert-never";
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
const toolSchema = z.object({ runId: z.string(), name: z.string(), input: z.unknown().optional(), toolUseId: z.string().optional(), ts: z.number().optional() });
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
  switch (event.name) {
    case "attached": {
      const { data } = event;
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
    }
    case "chunk":
      return {
        thread: appendTextChunk(prev.thread, event.data.text),
        usage: prev.usage,
        done: false,
        error: null,
      };
    case "tool": {
      const next = applyToolEvent(prev.thread, event.data);
      // A *new* row ends the text bubble above it; updating one must not, since
      // an assistant message can stream more text after its tool_use block.
      const thread = next.length > prev.thread.length ? closeStreaming(next) : next;
      return { thread, usage: prev.usage, done: false, error: null };
    }
    case "subagent": {
      const { data } = event;
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
    }
    case "subagent-update": {
      const { data } = event;
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
    }
    case "usage":
      return {
        thread: prev.thread,
        usage: { tokensIn: event.data.tokensIn, tokensOut: event.data.tokensOut, cost: event.data.cost },
        done: false,
        error: null,
      };
    case "done": {
      const { data } = event;
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
    }
    case "error": {
      const { data } = event;
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
    }
    case "rate-limit": {
      const { data } = event;
      const withoutEcho = dropTrailingTextEcho(prev.thread, data.message);
      // The CLI re-reports the same rate-limit signal on every subsequent tool
      // call while a warning is active, so find any existing rate-limit card
      // anywhere in the thread (not just the last item — other events interleave)
      // and update it in place, keeping its id so dismiss/retry stay bound to it.
      let existingIdx = -1;
      for (let i = withoutEcho.length - 1; i >= 0; i--) {
        if (withoutEcho[i]!.kind === "system-rate-limit") {
          existingIdx = i;
          break;
        }
      }
      const existing = existingIdx !== -1 ? withoutEcho[existingIdx] : undefined;
      const card = { kind: "system-rate-limit" as const, id: existing?.kind === "system-rate-limit" ? existing.id : newId(), message: data.message, resetsAt: data.resetsAt, severity: data.severity };
      const nextThread = existingIdx !== -1
        ? withoutEcho.map((it, i) => (i === existingIdx ? card : it))
        : [...withoutEcho, card];
      return {
        thread: closeStreaming(nextThread),
        usage: prev.usage,
        done: false,
        error: null,
      };
    }
    case "permission-request": {
      // The approval card is rendered from the pending-permissions query, not
      // from the thread — a prompt is transient state, not a transcript entry.
      // Handled here so the exhaustiveness check keeps covering the union.
      return { thread: prev.thread, usage: prev.usage, done: false, error: null };
    }
    default:
      return assertNever(event);
  }
}

function appendTextChunk(thread: ThreadItem[], text: string): ThreadItem[] {
  const last = thread[thread.length - 1];
  if (last && last.kind === "agent-text" && last.streaming) {
    const updated: ThreadItem = { ...last, text: last.text + text };
    return [...thread.slice(0, -1), updated];
  }
  return [...thread, { kind: "agent-text", id: newId(), text, streaming: true }];
}

/**
 * When a hit-limit is streamed as assistant text ("You've hit your session
 * limit …") AND then reported as a rate-limit result, the CLI gives us the same
 * copy twice. Drop the trailing agent-text bubble when it echoes the rate-limit
 * message so the card is the single source of truth.
 */
function dropTrailingTextEcho(thread: ThreadItem[], message: string): ThreadItem[] {
  const last = thread[thread.length - 1];
  if (!last || last.kind !== "agent-text") return thread;
  const a = last.text.trim().replace(/…$/, "").trim();
  const b = message.trim().replace(/…$/, "").trim();
  if (!a || !b) return thread;
  return a === b || a.includes(b) || b.includes(a) ? thread.slice(0, -1) : thread;
}

function closeStreaming(thread: ThreadItem[]): ThreadItem[] {
  return thread.map((it) =>
    it.kind === "agent-text" && it.streaming ? { ...it, streaming: false } : it,
  );
}



