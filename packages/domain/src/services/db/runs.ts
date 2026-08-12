import { getDb } from "./connection";
import type { PersistedRun } from "../../types/index";

export interface RunInsert {
  id: string; agentId: string; agentName: string;
  instanceId?: string; instanceLabel?: string; projectId?: string;
  sessionId?: string; status: string; prompt: string;
  model: string; effort: string; cwd?: string; startedAt: number;
  parentRunId?: string;
  accountId?: string;
}

export function insertRun(r: RunInsert): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO runs (id, agent_id, agent_name, instance_id, instance_label, project_id, session_id, status, prompt, output, model, effort, cwd, started_at, parent_run_id, account_id, owner_pid)
    VALUES (@id, @agentId, @agentName, @instanceId, @instanceLabel, @projectId, @sessionId, @status, @prompt, '', @model, @effort, @cwd, @startedAt, @parentRunId, @accountId, @ownerPid)
  `).run({ ...r, instanceId: r.instanceId ?? "default", instanceLabel: r.instanceLabel ?? null, projectId: r.projectId ?? null, sessionId: r.sessionId ?? null, cwd: r.cwd ?? null, parentRunId: r.parentRunId ?? null, accountId: r.accountId ?? null, ownerPid: process.pid });
}

export interface RunUpdate {
  status: string; exitCode?: number; output: string;
  tokensIn: number; tokensOut: number; costUsd: number;
  durMs: number; sessionId?: string; endedAt: number;
}

export function updateRun(id: string, u: RunUpdate): void {
  getDb().prepare(`
    UPDATE runs SET status=@status, exit_code=@exitCode, output=@output,
      tokens_in=@tokensIn, tokens_out=@tokensOut, cost_usd=@costUsd,
      dur_ms=@durMs, session_id=@sessionId, ended_at=@endedAt
    WHERE id=@id
  `).run({ id, ...u, exitCode: u.exitCode ?? null, sessionId: u.sessionId ?? null });
}

export function markRunAborted(id: string): void {
  const now = Date.now();
  getDb().prepare(
    "UPDATE runs SET status='error', exit_code=-1, ended_at=@now, dur_ms=MAX(0, @now-started_at) WHERE id=@id AND status='running'"
  ).run({ now, id });
}

interface RunRow {
  id: string; agent_id: string; agent_name: string; instance_id: string;
  instance_label: string | null; project_id: string | null; session_id: string | null;
  status: string; exit_code: number | null; prompt: string; output: string;
  tokens_in: number; tokens_out: number; cost_usd: number; dur_ms: number | null;
  model: string; effort: string; cwd: string | null; started_at: number; ended_at: number | null;
  parent_run_id: string | null; account_id: string | null;
}

function rowToRun(row: RunRow): PersistedRun {
  return {
    id: row.id, agentId: row.agent_id, agentName: row.agent_name,
    instanceId: row.instance_id === "default" ? undefined : row.instance_id,
    instanceLabel: row.instance_label ?? undefined,
    projectId: row.project_id ?? undefined, sessionId: row.session_id ?? undefined,
    status: row.status as "running" | "done" | "error",
    exitCode: row.exit_code ?? undefined, prompt: row.prompt, output: row.output,
    tokensIn: row.tokens_in, tokensOut: row.tokens_out, cost: row.cost_usd,
    durMs: row.dur_ms ?? (row.ended_at != null ? row.ended_at - row.started_at : 0), model: row.model, effort: row.effort,
    cwd: row.cwd ?? undefined, ts: row.started_at,
    parentRunId: row.parent_run_id ?? undefined,
    accountId: row.account_id ?? undefined,
  };
}

export interface ListRunsOpts {
  agentId?: string; projectId?: string; instanceId?: string; limit?: number;
}

export function listRuns(opts: ListRunsOpts = {}): PersistedRun[] {
  const { agentId, projectId, instanceId, limit = 200 } = opts;
  const conditions: string[] = [];
  const params: Record<string, unknown> = { limit };
  if (agentId) { conditions.push("agent_id = @agentId"); params.agentId = agentId; }
  if (projectId) { conditions.push("project_id = @projectId"); params.projectId = projectId; }
  if (instanceId) { conditions.push("instance_id = @instanceId"); params.instanceId = instanceId; }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const rows = getDb().prepare(`SELECT * FROM runs ${where} ORDER BY started_at DESC LIMIT @limit`).all(params) as RunRow[];
  return rows.map(rowToRun);
}

export function getSumCostSince(sinceTimestamp: number): number {
  const row = getDb().prepare(
    "SELECT COALESCE(SUM(cost_usd), 0) as total FROM runs WHERE started_at >= ?"
  ).get(sinceTimestamp) as { total: number };
  return row.total;
}

export function getSpendForInstance(agentId: string, instanceId: string): number {
  const row = getDb().prepare(
    "SELECT COALESCE(SUM(cost_usd), 0) as total FROM runs WHERE agent_id = ? AND instance_id = ?"
  ).get(agentId, instanceId) as { total: number };
  return row.total;
}

export function getSpendByInstanceForProject(projectId: string): Record<string, number> {
  const rows = getDb().prepare(
    "SELECT agent_id, instance_id, COALESCE(SUM(cost_usd), 0) as total FROM runs WHERE project_id = ? GROUP BY agent_id, instance_id"
  ).all(projectId) as Array<{ agent_id: string; instance_id: string; total: number }>;
  const out: Record<string, number> = {};
  for (const row of rows) {
    out[`${row.agent_id}|${row.instance_id}`] = row.total;
  }
  return out;
}

export function getRun(id: string): PersistedRun | null {
  const row = getDb().prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow | undefined;
  return row ? rowToRun(row) : null;
}

// ─── Rate-limit outcome (used by the scheduler to detect a repeat limit) ──────

export function setRunRateLimitResetsAt(id: string, resetsAt: number): void {
  getDb().prepare("UPDATE runs SET rate_limited_resets_at = @resetsAt WHERE id = @id").run({ id, resetsAt });
}

export function getRunOutcome(id: string): { status: string; rateLimitedResetsAt: number | null } | null {
  const row = getDb()
    .prepare("SELECT status, rate_limited_resets_at FROM runs WHERE id = ?")
    .get(id) as { status: string; rate_limited_resets_at: number | null } | undefined;
  return row ? { status: row.status, rateLimitedResetsAt: row.rate_limited_resets_at ?? null } : null;
}

export function getChildRuns(parentRunId: string): PersistedRun[] {
  const rows = getDb().prepare(
    "SELECT * FROM runs WHERE parent_run_id = ? ORDER BY started_at ASC"
  ).all(parentRunId) as RunRow[];
  return rows.map(rowToRun);
}

export function deleteRunsForInstance(projectId: string, instanceId: string): number {
  const db = getDb();
  const runIds = (db.prepare("SELECT id FROM runs WHERE project_id = ? AND instance_id = ?").all(projectId, instanceId) as { id: string }[]).map(r => r.id);
  if (runIds.length === 0) return 0;
  const placeholders = runIds.map(() => "?").join(",");
  const deleteToolCalls = db.prepare(`DELETE FROM tool_calls WHERE run_id IN (${placeholders})`);
  const deleteMessages = db.prepare(`DELETE FROM messages WHERE run_id IN (${placeholders})`);
  const deleteRuns = db.prepare("DELETE FROM runs WHERE project_id = ? AND instance_id = ?");
  let changes = 0;
  db.transaction(() => {
    deleteToolCalls.run(...runIds);
    deleteMessages.run(...runIds);
    changes = deleteRuns.run(projectId, instanceId).changes;
  })();
  return changes;
}

export function deleteRunsByAgent(agentId: string): number {
  const db = getDb();
  let changes = 0;
  db.transaction(() => {
    db.prepare("DELETE FROM tool_calls WHERE run_id IN (SELECT id FROM runs WHERE agent_id = ?)").run(agentId);
    db.prepare("DELETE FROM messages WHERE agent_id = ?").run(agentId);
    changes = db.prepare("DELETE FROM runs WHERE agent_id = ?").run(agentId).changes;
  })();
  return changes;
}
