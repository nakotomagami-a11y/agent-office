import type { PersistedRun, Workflow } from "../types/index";
import * as db from "./db";

export function getRuns(opts: { agentId?: string; projectId?: string; instanceId?: string; limit?: number } = {}): PersistedRun[] {
  return db.listRuns(opts);
}

export function getRun(id: string): PersistedRun | null {
  return db.getRun(id);
}

export function markRunAborted(id: string): void {
  db.markRunAborted(id);
}

/**
 * A row that says "running" but is absent from this process's live registry is
 * only dead if the process that spawned it is also gone - another worker (or
 * the pre-restart one) may still be driving it.
 */
export function isRunOrphaned(id: string): boolean {
  return db.isRunOrphaned(id);
}

export function pushRun(run: PersistedRun): void {
  // upsert - run may already exist (inserted at startRun time)
  db.updateRun(run.id, {
    status: run.status,
    exitCode: run.exitCode,
    output: run.output,
    tokensIn: run.tokensIn,
    tokensOut: run.tokensOut,
    costUsd: run.cost,
    durMs: run.durMs,
    sessionId: run.sessionId,
    endedAt: run.ts + run.durMs,
  });
}

export function getChildRuns(parentRunId: string): PersistedRun[] {
  return db.getChildRuns(parentRunId);
}

export function deleteRunsForInstance(projectId: string, instanceId: string): number {
  return db.deleteRunsForInstance(projectId, instanceId);
}

export function deleteRunsByAgent(agentId: string): number {
  return db.deleteRunsByAgent(agentId);
}

export function getRecentPrompts(agentId: string): string[] {
  return db.getRecentPrompts(agentId);
}

export function pushRecentPrompt(agentId: string, prompt: string): void {
  db.pushRecentPrompt(agentId, prompt);
}

export function getAllRecentPrompts(): Record<string, string[]> {
  return db.getAllRecentPrompts();
}

// ─── Workflows ─────────────────────────────────────────────────────────────

export function getWorkflows(opts?: { category?: string; q?: string }): Workflow[] {
  return db.getWorkflows(opts);
}

export function getWorkflow(id: string): Workflow | null {
  return db.getWorkflow(id);
}

export function createWorkflow(data: { title: string; body: string; category?: string }): Workflow {
  return db.createWorkflow(data);
}

export function deleteWorkflow(id: string): void {
  db.deleteWorkflow(id);
}

export function recordWorkflowUsage(id: string): void {
  db.recordWorkflowUsage(id);
}

export function bulkInsertWorkflows(
  workflows: Array<{ title: string; body: string; category: string }>
): number {
  return db.bulkInsertWorkflows(workflows);
}
