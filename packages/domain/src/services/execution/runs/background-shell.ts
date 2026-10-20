// Tracking `run_in_background` Bash shells a `claude` run spawns. Claude's
// stream-json carries no PID for a backgrounded shell, so we find it among the
// run's direct children by start time: the ones started after the call.
// Cohesive and low-coupling: reads the process table + writes the DB, no
// dependency on the live-run registry, broadcast, or stream handling.

import type { LiveRun } from "./types";
import { log } from "../../infra/log";
import * as db from "../../db";
import { scanner, type ChildProc, type ProcessScanner } from "../process-scan";

/** A backgrounded Bash tool call awaiting its shell's PID — captured at
 *  tool_use time, resolved at tool_result time by `trackBackgroundShell`. */
export interface PendingBackgroundBash {
  command: string;
  description?: string;
  /** When the tool_use was read: the shell is a child started after it. */
  requestedAt: number;
}

/** The call returned but its command runs on (background, timeout, or a message
 *  arriving). Bash's structured output says so; the prose is the fallback when
 *  it is missing, so a Read of this very file is not misread. */
export function isBackgroundedBashResult(toolUseResult: unknown, resultText: string): boolean {
  if (toolUseResult && typeof toolUseResult === "object") {
    return typeof (toolUseResult as { backgroundTaskId?: unknown }).backgroundTaskId === "string";
  }
  return /moved to the background \(ID: |running in background with ID: /.test(resultText);
}

/** Type guard for a Bash tool input that requested a backgrounded shell. */
export function isBackgroundBashInput(input: unknown): input is { command: string; description?: unknown } {
  if (!input || typeof input !== "object") return false;
  const r = input as Record<string, unknown>;
  return r.run_in_background === true && typeof r.command === "string";
}

/** The CLI may start the shell before this server reads the tool_use, and `ps
 *  etime` has 1 s resolution. */
const START_SLACK_MS = 1500;

/** Snapshot at the run's first background call, not at every run's start: a Windows probe
 *  is a PowerShell process. Taken per run once, since MCP servers start with the CLI. */
export function noteEarlierChildren(run: LiveRun, scan: ProcessScanner | null = scanner ?? null): void {
  const pid = run.proc.pid;
  if (!pid || !scan || run.earlierChildren) return;
  run.earlierChildren = scan.children(pid).then((kids) => kids ?? []).catch(() => []);
}

/** The one child started for this call: the closest after it, skipping shells
 *  earlier calls claimed. Parallel calls then get one shell each, not all of them. */
export function pickShell(children: ChildProc[], requestedAt: number, taken: ReadonlySet<number>): ChildProc | null {
  const candidates = children.filter((c) => c.startedAt >= requestedAt - START_SLACK_MS && !taken.has(c.pid));
  return candidates.sort((x, y) => Math.abs(x.startedAt - requestedAt) - Math.abs(y.startedAt - requestedAt))[0] ?? null;
}

const tracking = new WeakMap<LiveRun, Promise<void>>();

/** Called once the tool_result confirms a backgrounded shell actually started.
 *  Serialised per run, so two calls never read the same claimed set. Best-effort:
 *  a failure leaves this one shell untracked and says so in the log (it once
 *  failed silently on every Windows and macOS machine: `ps --ppid` is procps-only). */
export function trackBackgroundShell(
  run: LiveRun,
  pending: PendingBackgroundBash,
  scan: ProcessScanner | null = scanner ?? null,
): Promise<void> {
  const next = (tracking.get(run) ?? Promise.resolve()).then(() => trackOne(run, pending, scan));
  tracking.set(run, next);
  return next;
}

async function trackOne(run: LiveRun, pending: PendingBackgroundBash, scan: ProcessScanner | null): Promise<void> {
  const parent = run.proc.pid;
  if (!parent) return;
  try {
    const children = scan ? await scan.children(parent) : null;
    if (children === null) {
      log.warn("background_shell.scan_failed", { runId: run.id, pid: parent, platform: process.platform });
      return;
    }
    // The snapshot may finish after this call's shell started: only what predates the call is the CLI's.
    const earlier = (await run.earlierChildren ?? []).filter((c) => c.startedAt < pending.requestedAt);
    const taken = new Set([
      ...earlier.map((c) => c.pid),
      ...db.listBackgroundShells().filter((r) => r.runId === run.id).map((r) => r.pid),
    ]);
    const shell = pickShell(children, pending.requestedAt, taken);
    if (!shell) return log.debug("background_shell.not_found", { runId: run.id, pid: parent, children: children.length });
    db.insertBackgroundShell({
      runId: run.id,
      agentId: run.agentId,
      agentName: run.agentName,
      instanceId: run.instanceId,
      instanceLabel: run.instanceLabel,
      projectId: run.projectId,
      pid: shell.pid,
      command: pending.command,
      description: pending.description,
      startedAt: shell.startedAt,
    });
  } catch (err) {
    log.warn("background_shell.track_failed", { runId: run.id, err: String(err) });
  }
}
