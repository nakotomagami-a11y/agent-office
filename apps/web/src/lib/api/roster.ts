/**
 * API module for per-instance roster operations exposed under
 * `/api/projects/:id/roster/:instanceId/*`.
 */

import { API_ROUTES } from "@agent-office/domain/config/routes";
import { apiClient } from "@/lib/api-client";

export interface RepairWorktreeResult {
  ok: boolean;
  cwd: string | null;
}

/** Recreate a missing git worktree for an instance (or clear its dead pin). */
export async function repairWorktree(
  projectId: string,
  instanceId: string,
): Promise<RepairWorktreeResult> {
  const res = await apiClient.post<RepairWorktreeResult>(
    API_ROUTES.projectRosterRepairWorktree(projectId, instanceId),
  );
  return res.data;
}
