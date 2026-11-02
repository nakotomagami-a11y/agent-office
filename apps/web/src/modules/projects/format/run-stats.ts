// Pure functions that turn a project's run history into dashboard numbers.
// No side effects, no fetching — callers pass in the runs already loaded via `useRuns()`.

import type { AgentInstance, PersistedRun } from "@agent-office/domain/types";
import { looksLikeQuestion } from "@/modules/summon/format/thread-rows";

export interface RunStats {
  /** Total cost across runs started today (local midnight cutoff). */
  spendToday: number;
}

export function computeRunStats(runs: PersistedRun[]): RunStats {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const today = midnight.getTime();
  return { spendToday: runs.reduce((sum, run) => (run.ts >= today ? sum + run.cost : sum), 0) };
}

/** Runs still in flight, most recently started first. */
export function runningRuns(runs: PersistedRun[]): PersistedRun[] {
  return runs.filter((r) => r.status === "running").sort((a, b) => b.ts - a.ts);
}

/**
 * Runs that are genuinely blocked on the user, most recently started first.
 *
 * A *running* process can never be one of these — this CLI harness always
 * exits the subprocess when it wants a reply rather than pausing mid-run, so
 * "needs a reply" is a property of the most recent *finished* turn in a
 * conversation, not of whatever run happens to be first in a running list.
 *
 * For each agent instance (falling back to agentId when a run predates
 * multi-instance), look at only its latest run: if that run is done and its
 * final output reads as a question, the human hasn't answered it yet — any
 * later run for that instance would itself be the newest and would replace
 * it here, so "latest run is a question" already means "no reply since".
 *
 * `roster` scopes this to instances that still exist in the project today.
 * An instance removed from the roster has no reachable chat surface left to
 * show a reply prompt in — surfacing one for it here anyway is exactly the
 * false "still waiting" card this function must not produce (that instance
 * may be from a long-abandoned thread the human simply moved on from without
 * ever formally "replying", which the raw "ends in a question mark" text
 * heuristic can't tell apart from a genuinely fresh, unanswered one). Runs
 * that predate per-instance tracking (`instanceId` unset) have no instance
 * to check and are kept as-is.
 */
export function runsAwaitingReply(runs: PersistedRun[], roster: AgentInstance[]): PersistedRun[] {
  const currentInstanceIds = new Set(roster.map((i) => i.instanceId));
  const latestByThread = new Map<string, PersistedRun>();
  for (const run of runs) {
    const key = run.instanceId ?? run.agentId;
    const current = latestByThread.get(key);
    if (!current || run.ts > current.ts) latestByThread.set(key, run);
  }
  return Array.from(latestByThread.values())
    .filter((r) => r.status === "done" && looksLikeQuestion(r.output))
    .filter((r) => !r.instanceId || currentInstanceIds.has(r.instanceId))
    .sort((a, b) => b.ts - a.ts);
}

/** The line a reply card quotes: the question `looksLikeQuestion` matched on, else the output's last line. */
export function questionOf(output: string): string {
  const lines = output.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.slice(-5).reverse().find((l) => l.endsWith("?")) ?? lines.at(-1) ?? "";
}
