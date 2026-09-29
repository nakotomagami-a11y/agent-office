// Pending permission decisions.
//
// `bypassPermissions` on every agent was never a security posture — it was the
// absence of a channel. Runs are headless `claude -p` with stdin closed, so a
// tool call needing approval had nothing to ask. The CLI has always been ready
// for this: `--permission-prompts` defaults to `host`. Nothing was listening.
//
// This is the listener. A request parks here until the user answers or the
// timeout fires; it NEVER blocks forever, because a parked run holds a child
// process and a sleep inhibitor.

import { randomUUID } from "node:crypto";
import { log } from "../infra/log";

export type PermissionDecision = "allow" | "deny";

export interface PermissionRequest {
  id: string;
  runId: string;
  tool: string;
  input: unknown;
  createdAt: number;
}

interface Pending extends PermissionRequest {
  resolve: (d: PermissionDecision) => void;
  timer: ReturnType<typeof setTimeout>;
}

declare global {
  var __agentOfficePermissions: Map<string, Pending> | undefined;
}

const pending: Map<string, Pending> =
  globalThis.__agentOfficePermissions ?? (globalThis.__agentOfficePermissions = new Map());

/** Unanswered requests auto-DENY. Never default to allow: a user who has walked
 *  away must not silently approve a destructive command. */
export const DECISION_TIMEOUT_MS = 5 * 60 * 1000;

export function listPending(runId?: string): PermissionRequest[] {
  const all = [...pending.values()].map(({ resolve: _r, timer: _t, ...rest }) => rest);
  return runId ? all.filter((p) => p.runId === runId) : all;
}

/**
 * Park a request and return the decision when it arrives. `onCreated` fires
 * synchronously with the request so the caller can broadcast it before awaiting.
 */
export function requestPermission(opts: {
  runId: string;
  tool: string;
  input: unknown;
  timeoutMs?: number;
  onCreated?: (req: PermissionRequest) => void;
}): Promise<PermissionDecision> {
  // Fail closed rather than parking unboundedly.
  if (listPending(opts.runId).length >= MAX_PENDING_PER_RUN) {
    log.warn("permission.too_many_pending", { runId: opts.runId, tool: opts.tool });
    return Promise.resolve("deny");
  }
  const req: PermissionRequest = {
    id: randomUUID(),
    runId: opts.runId,
    tool: opts.tool,
    input: opts.input,
    createdAt: Date.now(),
  };
  return new Promise<PermissionDecision>((resolve) => {
    const timer = setTimeout(() => {
      if (!pending.delete(req.id)) return;
      log.warn("permission.timeout", { runId: req.runId, tool: req.tool, id: req.id });
      resolve("deny");
    }, opts.timeoutMs ?? DECISION_TIMEOUT_MS);
    // Deliberately NOT unref'd: this timer is the only thing guaranteeing the
    // request is ever answered. Unref'ing it lets the process exit with a run
    // still parked, which is the hang this exists to prevent. It is bounded.
    pending.set(req.id, { ...req, resolve, timer });
    opts.onCreated?.(req);
  });
}

/** Each parked entry holds its `input` for the full timeout — uncapped, a loop
 *  of POSTs is a memory DoS. */
export const MAX_PENDING_PER_RUN = 16;

/** False when the id is unknown OR belongs to another run: a late answer must
 *  not throw, and the runId in the URL must not be decorative. */
export function resolvePermission(runId: string, id: string, decision: PermissionDecision): boolean {
  const p = pending.get(id);
  if (!p || p.runId !== runId) return false;
  pending.delete(id);
  clearTimeout(p.timer);
  log.info("permission.resolved", { runId: p.runId, tool: p.tool, decision });
  p.resolve(decision);
  return true;
}

/** Deny everything still parked for a run. Called when a run ends so a finished
 *  run cannot leave a prompt hanging in the UI forever. */
export function denyAllForRun(runId: string): number {
  let n = 0;
  for (const [id, p] of [...pending]) {
    if (p.runId !== runId) continue;
    pending.delete(id);
    clearTimeout(p.timer);
    p.resolve("deny");
    n++;
  }
  if (n > 0) log.info("permission.run_ended_denied", { runId, count: n });
  return n;
}
