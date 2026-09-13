// Background shells an agent started via a `run_in_background` Bash call —
// see execution/runs.ts (capture) and execution/processes.ts (surfaced
// alongside port-scanned dev servers in the Servers modal). See the v15→v16
// migration for why there's no status/ended_at column.
import { randomUUID } from "node:crypto";
import { getDb } from "./connection";

export interface BackgroundShellRow {
  id: string;
  runId: string;
  agentId: string;
  agentName: string;
  instanceId: string | null;
  instanceLabel: string | null;
  projectId: string | null;
  pid: number;
  command: string;
  description: string | null;
  startedAt: number;
}

interface RawRow {
  id: string; run_id: string; agent_id: string; agent_name: string;
  instance_id: string | null; instance_label: string | null; project_id: string | null;
  pid: number; command: string; description: string | null; started_at: number;
}

function fromRaw(r: RawRow): BackgroundShellRow {
  return {
    id: r.id, runId: r.run_id, agentId: r.agent_id, agentName: r.agent_name,
    instanceId: r.instance_id, instanceLabel: r.instance_label, projectId: r.project_id,
    pid: r.pid, command: r.command, description: r.description, startedAt: r.started_at,
  };
}

export interface BackgroundShellInsert {
  runId: string; agentId: string; agentName: string;
  instanceId?: string; instanceLabel?: string; projectId?: string;
  pid: number; command: string; description?: string; startedAt: number;
}

export function insertBackgroundShell(r: BackgroundShellInsert): BackgroundShellRow {
  const id = randomUUID();
  getDb().prepare(`
    INSERT INTO background_shells (id, run_id, agent_id, agent_name, instance_id, instance_label, project_id, pid, command, description, started_at)
    VALUES (@id, @runId, @agentId, @agentName, @instanceId, @instanceLabel, @projectId, @pid, @command, @description, @startedAt)
  `).run({
    id, ...r,
    instanceId: r.instanceId ?? null, instanceLabel: r.instanceLabel ?? null,
    projectId: r.projectId ?? null, description: r.description ?? null,
  });
  return {
    id, runId: r.runId, agentId: r.agentId, agentName: r.agentName,
    instanceId: r.instanceId ?? null, instanceLabel: r.instanceLabel ?? null,
    projectId: r.projectId ?? null, pid: r.pid, command: r.command,
    description: r.description ?? null, startedAt: r.startedAt,
  };
}

export function listBackgroundShells(): BackgroundShellRow[] {
  const rows = getDb().prepare("SELECT * FROM background_shells").all() as RawRow[];
  return rows.map(fromRaw);
}

export function deleteBackgroundShell(id: string): void {
  getDb().prepare("DELETE FROM background_shells WHERE id = ?").run(id);
}

/** Every tracked shell PID for a run, oldest first — used to avoid
 *  re-tracking a child process this run already has a row for. */
export function listBackgroundShellPidsForRun(runId: string): number[] {
  const rows = getDb().prepare("SELECT pid FROM background_shells WHERE run_id = ?").all(runId) as { pid: number }[];
  return rows.map((r) => r.pid);
}
