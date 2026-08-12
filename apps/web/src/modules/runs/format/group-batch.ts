// Groups runs that started within a short window into parallel batches. Pure.

import type { PersistedRun } from "@agent-office/domain/types";

const PARALLEL_WINDOW_MS = 2_000;

export function groupByBatch(runs: PersistedRun[]): Array<PersistedRun[]> {
  const groups: Array<PersistedRun[]> = [];
  let current: PersistedRun[] = [];
  let batchAnchor = 0;

  for (const run of runs) {
    if (current.length === 0) {
      current.push(run);
      batchAnchor = run.ts;
    } else if (Math.abs(run.ts - batchAnchor) <= PARALLEL_WINDOW_MS) {
      current.push(run);
    } else {
      groups.push(current);
      current = [run];
      batchAnchor = run.ts;
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}
