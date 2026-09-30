// Durable Loop state. The machine in `execution/loop-machine.ts` is pure; this
// is where its state survives a restart. `active_run_id` is the join key: a
// finishing run is traced back to its loop through it.

import { getDb } from "./connection";
import type { Finding, LoopConfig, LoopPhase, LoopState, BindingConstraint } from "../execution/loop-machine";

export interface LoopRow {
  id: string;
  conversationId: string | null;
  agentId: string;
  instanceId: string | null;
  projectId: string | null;
  reviewerAgentId: string;
  cwd: string | null;
  goal: string;
  state: LoopState;
  config: LoopConfig;
  activeRunId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface RawLoopRow {
  id: string;
  conversation_id: string | null;
  agent_id: string;
  instance_id: string | null;
  project_id: string | null;
  reviewer_agent_id: string;
  cwd: string | null;
  goal: string;
  phase: string;
  round: number;
  spent_usd: number;
  started_at: number;
  binding: string | null;
  config_json: string;
  open_json: string;
  history_json: string;
  active_run_id: string | null;
  created_at: number;
  updated_at: number;
}

const PHASES: LoopPhase[] = ["authoring", "reviewing", "fixing", "done", "escalated"];
const BINDINGS: BindingConstraint[] = [
  "converged", "max_rounds", "budget", "wall_clock", "review_failed", "author_failed",
  "fix_failed", "user_stopped", "invalid_findings", "dispatch_failed", "corrupt_state",
];

/** A ceiling that is absent, negative, NaN or Infinity is NOT a ceiling.
 *  `1e999` is valid JSON and parses to Infinity, which makes every comparison
 *  in the machine permanently false — the exact "unbounded" this guards. */
function positive(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Reviewer-authored text is interpolated into the AUTHOR's next prompt, so
 *  it is an agent-to-agent injection channel and a cost vector. Bounded here,
 *  at the parse boundary, rather than at each use. */
const MAX_FIELD = 2000;
const MAX_FINDINGS = 100;

function isFinding(v: unknown): v is Finding {
  if (typeof v !== "object" || v === null) return false;
  const f = v as Record<string, unknown>;
  const bounded = (x: unknown) => typeof x === "string" && x.length <= MAX_FIELD;
  return (
    (f.severity === "must-fix" || f.severity === "should-fix" || f.severity === "nit") &&
    bounded(f.ruleId) && (f.ruleId as string).trim().length > 0 &&
    bounded(f.why) &&
    (f.file === undefined || bounded(f.file))
  );
}

/** Rows are JSON text; a bad row must not take the app down with it. A dropped
 *  finding is recoverable, a thrown parse on every read is not. */
function findings(json: string): Finding[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  return Array.isArray(parsed) ? parsed.filter(isFinding).slice(0, MAX_FINDINGS) : [];
}

function config(json: string): LoopConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { maxRounds: 1 };
  }
  if (typeof parsed !== "object" || parsed === null) return { maxRounds: 1 };
  const c = parsed as Record<string, unknown>;
  // A missing ceiling must never read as "unbounded" — 1 round is the safe floor.
  const rounds = positive(c.maxRounds);
  return {
    maxRounds: rounds !== undefined && Number.isInteger(rounds) ? rounds : 1,
    budgetUsd: positive(c.budgetUsd),
    wallClockMs: positive(c.wallClockMs),
    blockOn: Array.isArray(c.blockOn) ? (c.blockOn.filter((s) => s === "must-fix" || s === "should-fix" || s === "nit") as LoopConfig["blockOn"]) : undefined,
  };
}

function toRow(r: RawLoopRow): LoopRow {
  const known = PHASES.includes(r.phase as LoopPhase);
  const phase = known ? (r.phase as LoopPhase) : "escalated";
  const storedBinding = BINDINGS.includes(r.binding as BindingConstraint)
    ? (r.binding as BindingConstraint)
    : undefined;
  // An unreadable phase or binding must still NAME its termination: without
  // this an escalated loop renders as "Running" and `allowOneMore` is inert.
  const binding = known ? storedBinding : (storedBinding ?? "corrupt_state");
  return {
    id: r.id,
    conversationId: r.conversation_id,
    agentId: r.agent_id,
    instanceId: r.instance_id,
    projectId: r.project_id,
    reviewerAgentId: r.reviewer_agent_id,
    cwd: r.cwd,
    goal: r.goal,
    activeRunId: r.active_run_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    config: config(r.config_json),
    state: {
      phase,
      round: r.round,
      spentUsd: r.spent_usd,
      startedAt: r.started_at,
      open: findings(r.open_json),
      history: findings(r.history_json),
      binding,
    },
  };
}

export function createLoop(loop: Omit<LoopRow, "createdAt" | "updatedAt">, now: number): void {
  getDb()
    .prepare(
      `INSERT INTO loops (id, conversation_id, agent_id, instance_id, project_id, reviewer_agent_id,
         cwd, goal, phase, round, spent_usd, started_at, binding, config_json, open_json,
         history_json, active_run_id, created_at, updated_at)
       VALUES (@id, @conversationId, @agentId, @instanceId, @projectId, @reviewerAgentId,
         @cwd, @goal, @phase, @round, @spentUsd, @startedAt, @binding, @configJson, @openJson,
         @historyJson, @activeRunId, @now, @now)`,
    )
    .run({
      id: loop.id,
      conversationId: loop.conversationId,
      agentId: loop.agentId,
      instanceId: loop.instanceId,
      projectId: loop.projectId,
      reviewerAgentId: loop.reviewerAgentId,
      cwd: loop.cwd,
      goal: loop.goal,
      phase: loop.state.phase,
      round: loop.state.round,
      spentUsd: loop.state.spentUsd,
      startedAt: loop.state.startedAt,
      binding: loop.state.binding ?? null,
      configJson: JSON.stringify(loop.config),
      openJson: JSON.stringify(loop.state.open),
      historyJson: JSON.stringify(loop.state.history),
      activeRunId: loop.activeRunId,
      now,
    });
}

/** Guarded write. A blind overwrite loses a concurrent user Stop: the writer
 *  read the row BEFORE awaiting a spawn, so it would clobber a termination
 *  decided while it was in flight. Returns false when the row moved on. */
export function updateLoopState(
  id: string,
  state: LoopState,
  activeRunId: string | null,
  now: number,
  expectedUpdatedAt?: number,
): boolean {
  const r = getDb()
    .prepare(
      `UPDATE loops SET phase=@phase, round=@round, spent_usd=@spentUsd, binding=@binding,
         open_json=@openJson, history_json=@historyJson, active_run_id=@activeRunId, updated_at=@now
       WHERE id=@id AND (@expectedUpdatedAt IS NULL OR updated_at=@expectedUpdatedAt)`,
    )
    .run({
      id,
      phase: state.phase,
      round: state.round,
      spentUsd: state.spentUsd,
      binding: state.binding ?? null,
      openJson: JSON.stringify(state.open),
      historyJson: JSON.stringify(state.history),
      activeRunId,
      now,
      expectedUpdatedAt: expectedUpdatedAt ?? null,
    });
  return r.changes === 1;
}

/** Atomically take ownership of a loop's active run; false when someone else
 *  already has it. In-process this is belt-and-braces — better-sqlite3 is
 *  synchronous, so read-then-claim cannot interleave. It is here for a SECOND
 *  PROCESS on the same db file (the app already guards against a stray
 *  instance elsewhere), where read-then-write would double-spawn a round. */
export function claimActiveRun(id: string, runId: string): boolean {
  const r = getDb()
    .prepare(`UPDATE loops SET active_run_id=NULL WHERE id=? AND active_run_id=?`)
    .run(id, runId);
  return r.changes === 1;
}

export function getLoop(id: string): LoopRow | null {
  const r = getDb().prepare(`SELECT * FROM loops WHERE id=?`).get(id) as RawLoopRow | undefined;
  return r ? toRow(r) : null;
}

/** The dispatcher's entry point: which loop, if any, is waiting on this run. */
export function getLoopByActiveRun(runId: string): LoopRow | null {
  const r = getDb().prepare(`SELECT * FROM loops WHERE active_run_id=?`).get(runId) as RawLoopRow | undefined;
  return r ? toRow(r) : null;
}

export function listLoopsForConversation(conversationId: string): LoopRow[] {
  const rows = getDb()
    .prepare(`SELECT * FROM loops WHERE conversation_id=? ORDER BY created_at ASC`)
    .all(conversationId) as RawLoopRow[];
  return rows.map(toRow);
}

/** Dev harness only: every recorded loop, newest first. */
export function listAllLoopIds(): string[] {
  const rows = getDb().prepare(`SELECT id FROM loops ORDER BY created_at DESC LIMIT 20`).all() as Array<{ id: string }>;
  return rows.map((r) => r.id);
}
