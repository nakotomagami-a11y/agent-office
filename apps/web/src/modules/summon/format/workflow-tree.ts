// Pure helpers for the Workflow spawn tree (counts + flattening).

import type { WorkflowNode } from "@agent-office/domain/types";

export interface WorkflowCounts {
  total: number;
  running: number;
  done: number;
  error: number;
}

/** All descendants of `root` (excludes the root itself), depth-first. */
export function flattenDescendants(root: WorkflowNode): WorkflowNode[] {
  const out: WorkflowNode[] = [];
  const walk = (node: WorkflowNode) => {
    for (const child of node.children) {
      out.push(child);
      walk(child);
    }
  };
  walk(root);
  return out;
}

/** Tally descendant statuses for the pill summary. */
export function countDescendants(root: WorkflowNode): WorkflowCounts {
  const counts: WorkflowCounts = { total: 0, running: 0, done: 0, error: 0 };
  for (const node of flattenDescendants(root)) {
    counts.total++;
    if (node.status === "running") counts.running++;
    else if (node.status === "done") counts.done++;
    else counts.error++;
  }
  return counts;
}
