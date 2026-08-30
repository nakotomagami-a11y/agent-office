// Map persisted run records into per-agent live status.
//
// Rules:
//   - Latest run for an agent within last 90s → use that run's status
//   - "running" trumps; otherwise "done" / "error" stick for 90s
//   - Fallback: "idle"
//
// Note: "thinking" (AgentStatus) is not produced here because PersistedRun
// only exposes "running" | "done" | "error". Real-time thinking state comes
// from SSE events in the chat panel, not from stored run records.

import { assertNever } from "@/lib/assert-never";
import type { AgentStatus, PersistedRun } from "@agent-office/domain/types";

const STICKY_MS = 90_000;

export interface AgentStatusInfo {
  status: AgentStatus;
  task?: string;
  taskKind?: string;
}

/**
 * Maps a run's terminal DB status to the richer, agent-facing status shape.
 * Was duplicated verbatim between `statusFromRunsForInstance` and
 * `statusFromRuns` as a ts-pattern block each — extracted once here since
 * removing ts-pattern meant touching both anyway.
 */
function statusInfoFromRunStatus(status: PersistedRun["status"], prompt: string): AgentStatusInfo {
  const task = truncate(prompt, 32);
  switch (status) {
    case "running": return { status: "working", task, taskKind: "Running" };
    case "done": return { status: "done", task, taskKind: "Done" };
    case "error": return { status: "error", task, taskKind: "Error" };
    default: return assertNever(status);
  }
}

export function statusFromRunsForInstance(instanceId: string, runs: PersistedRun[]): AgentStatusInfo {
  const now = Date.now();
  const recent = runs.filter(
    (r) => r.instanceId === instanceId && (r.status === "running" || now - r.ts < STICKY_MS),
  );
  if (recent.length === 0) return { status: "idle" };
  recent.sort((a, b) => b.ts - a.ts);
  const latest = recent[0]!;
  return statusInfoFromRunStatus(latest.status, latest.prompt);
}

export function statusFromRuns(agentId: string, runs: PersistedRun[]): AgentStatusInfo {
  const now = Date.now();
  // Running jobs are always shown regardless of age - a job can run for hours.
  // Completed jobs stick for 90s so the status doesn't flicker back to idle
  // the instant a run finishes.
  const recent = runs.filter(
    (r) => r.agentId === agentId && (r.status === "running" || now - r.ts < STICKY_MS),
  );
  if (recent.length === 0) return { status: "idle" };
  recent.sort((a, b) => b.ts - a.ts);
  const latest = recent[0]!;
  return statusInfoFromRunStatus(latest.status, latest.prompt);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
