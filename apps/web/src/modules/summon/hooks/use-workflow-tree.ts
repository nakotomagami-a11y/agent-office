"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { WorkflowNode } from "@agent-office/domain/types";
import { POLL } from "@/lib/polling";

/**
 * Fetch the live spawn tree rooted at `rootId`. Polls while the run is `active`
 * (streaming) so the pill reflects sub-agents appearing/finishing in real time;
 * stops polling once the run settles. Returns `undefined` data until loaded.
 */
export function useWorkflowTree(rootId: string | null, opts?: { active?: boolean }) {
  return useQuery({
    queryKey: queryKeys.runs.tree(rootId ?? "none"),
    queryFn: () => apiFetch<WorkflowNode>(API_ROUTES.runTree(rootId as string)),
    enabled: !!rootId,
    refetchInterval: opts?.active ? POLL.RUNS : false,
  });
}
