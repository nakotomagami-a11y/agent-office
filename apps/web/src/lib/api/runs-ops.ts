/**
 * API module for run lifecycle actions that aren't plain reads: abort-all,
 * per-project running counts, and wiping an agent's history.
 */

import type { PersistedRun } from "@agent-office/domain/types";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import { apiClient } from "@/lib/api-client";

export async function abortAllRuns(projectId?: string): Promise<void> {
  await apiClient.post(API_ROUTES.runsAbortAll, projectId ? { projectId } : {});
}

export async function abortRun(runId: string): Promise<void> {
  await apiClient.post(API_ROUTES.runAbort(runId));
}

export async function listRuns(params: { project?: string; agent?: string; limit?: number }): Promise<PersistedRun[]> {
  const res = await apiClient.get<PersistedRun[]>(API_ROUTES.runs, { params });
  return res.data;
}

export async function deleteAgentRuns(agentId: string): Promise<{ deleted?: number }> {
  const res = await apiClient.delete<{ deleted?: number }>(API_ROUTES.runs, { params: { agent: agentId } });
  return res.data;
}
