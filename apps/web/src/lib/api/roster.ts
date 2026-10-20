/**
 * API module for per-instance roster operations exposed under
 * `/api/projects/:id/roster/:instanceId/*`.
 */

import type { z } from "zod";
import { API_ROUTES, sessionConflictSchema } from "@agent-office/api-contract";
import type { SessionRemovalCode, WorkChoice } from "@agent-office/domain/config/sessions";
import type { Project } from "@agent-office/domain/types";
import { apiClient } from "@/lib/api-client";
import { apiFetch, ApiError } from "@/lib/api/fetch";

export interface RepairWorktreeResult {
  ok: boolean;
  cwd: string | null;
}

/** Recreate a missing git worktree for an instance; 409 `worktree_unrepairable` when it cannot be. */
export async function repairWorktree(
  projectId: string,
  instanceId: string,
): Promise<RepairWorktreeResult> {
  const res = await apiClient.post<RepairWorktreeResult>(
    API_ROUTES.projectRosterRepairWorktree(projectId, instanceId),
  );
  return res.data;
}

export type SessionAtRisk = z.infer<typeof sessionConflictSchema>["sessions"][number];

export interface SessionConflict {
  code: SessionRemovalCode;
  sessions: SessionAtRisk[];
  detail?: string;
}

/** The 409 a session, roster or agent DELETE answers when it would lose work or hit a live run. */
export function sessionConflictOf(err: unknown): SessionConflict | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const parsed = sessionConflictSchema.safeParse(err.data);
  if (!parsed.success) return null;
  return { code: parsed.data.error, sessions: parsed.data.sessions, detail: parsed.data.detail };
}

export const workQuery = (work?: WorkChoice): string => (work ? `?${new URLSearchParams({ work }).toString()}` : "");

export function removeSession(projectId: string, instanceId: string, work?: WorkChoice): Promise<Project> {
  return apiFetch<Project>(`${API_ROUTES.projectRosterItem(projectId, instanceId)}${workQuery(work)}`, { method: "DELETE" });
}

export function resetRoster(projectId: string, work?: WorkChoice): Promise<Project> {
  return apiFetch<Project>(`${API_ROUTES.projectRoster(projectId)}${workQuery(work)}`, { method: "DELETE" });
}
