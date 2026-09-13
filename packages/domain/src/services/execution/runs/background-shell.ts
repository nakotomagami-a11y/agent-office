// Tracking `run_in_background` Bash shells a `claude` run spawns. Claude's
// stream-json carries no PID for a backgrounded shell, so we find it by diffing
// the run's direct child PIDs against a snapshot taken just before the call.
// Cohesive and low-coupling: reads the process table + writes the DB, no
// dependency on the live-run registry, broadcast, or stream handling.

import { execFileSync } from "node:child_process";
import type { LiveRun } from "./types";
import { log } from "../../infra/log";
import * as db from "../../db";

/** A backgrounded Bash tool call awaiting its shell's PID — captured at
 *  tool_use time, resolved at tool_result time by `trackBackgroundShell`. */
export interface PendingBackgroundBash {
  command: string;
  description?: string;
  /** The run's direct child PIDs snapshotted right before the call, so the
   *  freshly-spawned shell can be isolated as "whatever is new". */
  childPidsBefore: Set<number>;
}

/** Type guard for a Bash tool input that requested a backgrounded shell. */
export function isBackgroundBashInput(input: unknown): input is { command: string; description?: unknown } {
  if (!input || typeof input !== "object") return false;
  const r = input as Record<string, unknown>;
  return r.run_in_background === true && typeof r.command === "string";
}

/** Direct child PIDs of `pid` right now, via `ps --ppid` (no manifest of
 *  Claude's own background tasks exists for an outside process to read —
 *  see `trackBackgroundShell`). Empty on any failure — never throws. */
export function snapshotChildPids(pid: number): number[] {
  try {
    const out = execFileSync("ps", ["--ppid", String(pid), "-o", "pid="], { encoding: "utf8", timeout: 2000 });
    return out.split("\n").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

/** Called once the tool_result confirms a backgrounded shell actually
 *  started. `claude`'s stream-json carries no PID for it, so we diff the
 *  run's current child PIDs against `pending.childPidsBefore` — whatever's
 *  new is the shell. Diffing per-call (not against "every PID ever seen")
 *  matters: other long-lived children (e.g. MCP server subprocesses) would
 *  otherwise be misread as a freshly-backgrounded shell. Best-effort — a
 *  failure here never affects the run, just leaves this one shell untracked. */
export function trackBackgroundShell(run: LiveRun, pending: PendingBackgroundBash): void {
  try {
    if (!run.proc.pid) return;
    const fresh = snapshotChildPids(run.proc.pid).filter((pid) => !pending.childPidsBefore.has(pid));
    for (const pid of fresh) {
      db.insertBackgroundShell({
        runId: run.id,
        agentId: run.agentId,
        agentName: run.agentName,
        instanceId: run.instanceId,
        instanceLabel: run.instanceLabel,
        projectId: run.projectId,
        pid,
        command: pending.command,
        description: pending.description,
        startedAt: Date.now(),
      });
    }
  } catch (err) {
    log.warn("background_shell.track_failed", { runId: run.id, err: String(err) });
  }
}
