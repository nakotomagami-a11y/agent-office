// Map persisted run records into per-agent live status.
//
// Rules:
//   - Latest run for an agent within last 90s → use that run's status
//   - "running" obviously trumps; otherwise "done" / "error" stick for 90s
//   - Fallback: "idle"
//
// Note: "thinking" (AgentStatus) is not produced here because PersistedRun
// only exposes "running" | "done" | "error". Real-time thinking state comes
// from SSE events in the chat panel, not from stored run records.

import { match } from "ts-pattern";
import type { AgentStatus, PersistedRun } from "@agent-office/domain/types";

const STICKY_MS = 90_000;

export interface AgentStatusInfo {
  status: AgentStatus;
  task?: string;
  taskKind?: string;
}

export function statusFromRunsForInstance(instanceId: string, runs: PersistedRun[]): AgentStatusInfo {
  const now = Date.now();
  const recent = runs.filter(
    (r) => r.instanceId === instanceId && (r.status === "running" || now - r.ts < STICKY_MS),
  );
  if (recent.length === 0) return { status: "idle" };
  recent.sort((a, b) => b.ts - a.ts);
  const latest = recent[0]!;
  return match(latest.status)
    .with("running", () => ({
      status: "working" as AgentStatus,
      task: truncate(latest.prompt, 32),
      taskKind: "Running",
    }))
    .with("done", () => ({
      status: "done" as AgentStatus,
      task: truncate(latest.prompt, 32),
      taskKind: "Done",
    }))
    .with("error", () => ({
      status: "error" as AgentStatus,
      task: truncate(latest.prompt, 32),
      taskKind: "Error",
    }))
    .exhaustive();
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
  return match(latest.status)
    .with("running", () => ({
      status: "working" as AgentStatus,
      task: truncate(latest.prompt, 32),
      taskKind: "Running",
    }))
    .with("done", () => ({
      status: "done" as AgentStatus,
      task: truncate(latest.prompt, 32),
      taskKind: "Done",
    }))
    .with("error", () => ({
      status: "error" as AgentStatus,
      task: truncate(latest.prompt, 32),
      taskKind: "Error",
    }))
    .exhaustive();
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
