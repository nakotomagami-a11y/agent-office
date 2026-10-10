"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/fetch";
import { queryKeys } from "@/lib/api/query-keys";
import { API_ROUTES } from "@agent-office/api-contract";
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
    // Driven by the app-wide SSE "runs:changed" event; while a workflow is
    // active, keep a slow reconnect safety net (nothing when idle).
    refetchInterval: opts?.active ? POLL.SAFETY_NET : false,
  });
}
