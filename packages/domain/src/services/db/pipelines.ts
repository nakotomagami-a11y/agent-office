import { getDb } from "./connection";
import type { PipelineRun, PipelineRunStep } from "../../types/index";

interface PipelineRow {
  id: string; project_id: string | null; status: string;
  created_at: number; ended_at: number | null; interrupted: number;
}
interface PipelineStepRow {
  pipeline_id: string; step_index: number; parallel_group: number | null;
  agent_id: string; run_id: string | null; status: string;
  output: string | null; exit_code: number | null;
}

function rowToPipelineRun(row: PipelineRow, stepRows: PipelineStepRow[]): PipelineRun {
  const steps: PipelineRunStep[] = stepRows.map((s) => ({
    stepIndex: s.step_index,
    agentId: s.agent_id,
    runId: s.run_id ?? "",
    status: s.status as PipelineRunStep["status"],
    output: s.output ?? undefined,
    exitCode: s.exit_code ?? undefined,
    parallelGroup: s.parallel_group ?? undefined,
  }));
  return {
    id: row.id,
    projectId: row.project_id ?? undefined,
    status: row.status as PipelineRun["status"],
    createdAt: row.created_at,
    interrupted: row.interrupted === 1 ? true : undefined,
    steps,
  };
}

export function insertPipeline(p: { id: string; projectId?: string; createdAt: number }): void {
  getDb().prepare(
    "INSERT OR IGNORE INTO pipelines (id, project_id, status, created_at, interrupted) VALUES (@id, @projectId, 'running', @createdAt, 0)"
  ).run({ id: p.id, projectId: p.projectId ?? null, createdAt: p.createdAt });
}

export function updatePipelineStatus(id: string, status: string, endedAt?: number): void {
  getDb().prepare("UPDATE pipelines SET status=@status, ended_at=@endedAt WHERE id=@id")
    .run({ id, status, endedAt: endedAt ?? null });
}

export function upsertPipelineStep(s: {
  pipelineId: string; stepIndex: number; parallelGroup?: number;
  agentId: string; runId?: string; status: string; output?: string; exitCode?: number;
}): void {
  getDb().prepare(`
    INSERT INTO pipeline_steps (pipeline_id, step_index, parallel_group, agent_id, run_id, status, output, exit_code)
    VALUES (@pipelineId, @stepIndex, @parallelGroup, @agentId, @runId, @status, @output, @exitCode)
    ON CONFLICT(pipeline_id, step_index) DO UPDATE SET
      run_id=excluded.run_id, status=excluded.status, output=excluded.output, exit_code=excluded.exit_code
  `).run({
    pipelineId: s.pipelineId, stepIndex: s.stepIndex,
    parallelGroup: s.parallelGroup ?? null,
    agentId: s.agentId, runId: s.runId ?? null,
    status: s.status, output: s.output ?? null, exitCode: s.exitCode ?? null,
  });
}

export function getPipelineFromDb(id: string): PipelineRun | null {
  const row = getDb().prepare("SELECT * FROM pipelines WHERE id=?").get(id) as PipelineRow | undefined;
  if (!row) return null;
  const steps = getDb().prepare("SELECT * FROM pipeline_steps WHERE pipeline_id=? ORDER BY step_index").all(id) as PipelineStepRow[];
  return rowToPipelineRun(row, steps);
}

export function listInterruptedPipelines(): PipelineRun[] {
  // Single JOIN instead of N+1 individual steps queries.
  type JoinRow = {
    p_id: string; project_id: string | null; p_status: string;
    created_at: number; ended_at: number | null; interrupted: number;
    step_index: number | null; parallel_group: number | null;
    agent_id: string | null; run_id: string | null; step_status: string | null;
    output: string | null; exit_code: number | null;
  };
  const rows = getDb().prepare(`
    SELECT
      p.id AS p_id, p.project_id, p.status AS p_status, p.created_at, p.ended_at, p.interrupted,
      ps.step_index, ps.parallel_group, ps.agent_id, ps.run_id, ps.status AS step_status, ps.output, ps.exit_code
    FROM (SELECT * FROM pipelines WHERE interrupted=1 ORDER BY created_at DESC LIMIT 50) p
    LEFT JOIN pipeline_steps ps ON ps.pipeline_id = p.id
    ORDER BY p.created_at DESC, ps.step_index
  `).all() as JoinRow[];

  const map = new Map<string, { row: PipelineRow; steps: PipelineStepRow[] }>();
  const order: string[] = [];
  for (const r of rows) {
    if (!map.has(r.p_id)) {
      order.push(r.p_id);
      map.set(r.p_id, {
        row: { id: r.p_id, project_id: r.project_id, status: r.p_status, created_at: r.created_at, ended_at: r.ended_at, interrupted: r.interrupted },
        steps: [],
      });
    }
    if (r.step_index !== null && r.agent_id !== null) {
      map.get(r.p_id)!.steps.push({
        pipeline_id: r.p_id,
        step_index: r.step_index,
        parallel_group: r.parallel_group,
        agent_id: r.agent_id,
        run_id: r.run_id,
        status: r.step_status ?? "pending",
        output: r.output,
        exit_code: r.exit_code,
      });
    }
  }
  return order.map((id) => {
    const { row, steps } = map.get(id)!;
    return rowToPipelineRun(row, steps);
  });
}
