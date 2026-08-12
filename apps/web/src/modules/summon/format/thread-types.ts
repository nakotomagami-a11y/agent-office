// In-memory thread item shapes built from SSE events. The chat panel renders
// these directly - keeping them denormalised here means components don't have
// to know anything about the wire format.

import type { RunErrorCode } from "@agent-office/domain/types";

export type SubAgentStatus = "queued" | "running" | "cancelling" | "done" | "error" | "cancelled" | "timeout";

export type ThreadItem =
  | { kind: "you"; id: string; text: string }
  | { kind: "agent-text"; id: string; text: string; streaming: boolean }
  | { kind: "agent-tool"; id: string; name: string; arg?: string }
  | { kind: "agent-thinking"; id: string; text: string }
  | { kind: "agent-subagent"; id: string; name: string; prompt: string; status: SubAgentStatus; startTs: number; durationMs?: number; subRunId?: string; currentTool?: string; tokensIn?: number; tokensOut?: number; cost?: number; lastOutputLine?: string }
  | { kind: "system-error"; id: string; code: RunErrorCode; detail?: string; interrupted?: boolean }
  | { kind: "system-rate-limit"; id: string; message: string; resetsAt?: number; severity: "warning" | "limit" }
  | { kind: "system-done"; id: string; exitCode: number; durationMs?: number; tokensIn?: number; tokensOut?: number; cost?: number };

export interface UsageMeter {
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

export type RunPhase = "idle" | "starting" | "streaming" | "done" | "error";
