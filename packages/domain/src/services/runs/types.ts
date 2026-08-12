// Shared types for the run runtime. Kept separate from the stateful core so the
// pure helper modules (errors, subagent-parse) can reference them without
// importing the state machine.

import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import type {
  SseAttachedEvent,
  SseChunkEvent,
  SseDoneEvent,
  SseErrorEvent,
  SseRateLimitEvent,
  SseSubAgentEvent,
  SseSubAgentUpdateEvent,
  SseToolEvent,
  SseUsageEvent,
  SubAgentStatus,
} from "../../types/index";

export type SseEvent =
  | { name: "attached"; data: SseAttachedEvent }
  | { name: "chunk"; data: SseChunkEvent }
  | { name: "tool"; data: SseToolEvent }
  | { name: "usage"; data: SseUsageEvent }
  | { name: "done"; data: SseDoneEvent }
  | { name: "error"; data: SseErrorEvent }
  | { name: "rate-limit"; data: SseRateLimitEvent }
  | { name: "subagent"; data: SseSubAgentEvent }
  | { name: "subagent-update"; data: SseSubAgentUpdateEvent };

export type SseEmit = (event: SseEvent) => void | Promise<void>;

export type ReplayableEvent = Extract<SseEvent, { name: "chunk" | "tool" | "usage" | "subagent" }>;

export interface SubAgentRecord {
  subRunId: string;
  agentId: string;
  prompt: string;
  startTs: number;
  status: SubAgentStatus;
}

export interface LiveRun {
  id: string;
  agentId: string;
  agentName: string;
  startTs: number;
  prompt: string;
  model: string;
  effort: string;
  cwd?: string;
  projectId?: string;
  instanceId?: string;
  instanceLabel?: string;
  output: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  status: "running" | "done" | "error";
  exitCode?: number;
  /** Set when the user explicitly aborts the run, so the resulting error is
   *  surfaced as a neutral "interrupted" card rather than a red failure. */
  aborted?: boolean;
  sessionId?: string;
  proc: ChildProcessByStdio<null, Readable, Readable>;
  subscribers: Set<SseEmit>;
  finishedAt?: number;
  parseFailures: number;
  sawStreamDelta: boolean;
  rateLimitResetsAt?: number;
  args: string[];
  stderrBuf: string;
  lastActivityAt: number;
  /** Ordered log of chunk/tool/usage events for full replay to late subscribers. */
  eventLog: ReplayableEvent[];
  /** Parent run ID if this is a sub-agent run. */
  parentRunId?: string;
  /** IDs of child runs spawned by Task tool calls. */
  childRunIds: string[];
  /**
   * Sub-agent records keyed by the spawning tool_use id. Lets us correlate the
   * later `tool_result` line back to the sub-agent so we can finalize its card
   * even when the child never registers in `liveRuns` (native Task/Agent and
   * Bash `claude -p` spawns both run outside this process's run registry).
   */
  subAgents: Map<string, SubAgentRecord>;
}

export interface StartRunOpts {
  agentId: string;
  agentName: string;
  prompt: string;
  model: string;
  effort: string;
  cwd?: string;
  projectId?: string;
  instanceId?: string;
  instanceLabel?: string;
  args: string[];
  parentRunId?: string;
  /**
   * Multi-account: explicit account override. When set, the child claude
   * process gets `CLAUDE_CONFIG_DIR=<that account's dir>`. When unset,
   * we resolve it from the project's frontmatter (`projectId` →
   * `project.meta.accountId`). Undefined for both → no CLAUDE_CONFIG_DIR
   * set → identical to pre-multi-account behavior (uses `~/.claude`).
   */
  accountId?: string;
}

export interface StreamEvent {
  type?: string;
  event?: { type?: string; delta?: { type?: string; text?: string }; content_block?: { type?: string; name?: string; input?: unknown } };
  message?: { content?: Array<{ type: string; id?: string; text?: string; name?: string; input?: unknown; tool_use_id?: string; content?: unknown; is_error?: boolean }>; usage?: { input_tokens?: number; output_tokens?: number } };
  usage?: { input_tokens?: number; output_tokens?: number };
  total_cost_usd?: number;
  session_id?: string;
  is_error?: boolean;
  error?: string;
  rate_limit_info?: { status?: string; resetsAt?: number; rateLimitType?: string };
}
