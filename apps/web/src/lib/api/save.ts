/**
 * API module for export/import of app state (`/api/save/*`). Export returns a
 * binary JSON blob for download; import posts a parsed snapshot.
 */

import { API_ROUTES } from "@agent-office/domain/config/routes";
import { apiClient } from "@/lib/api-client";

export interface ImportResult {
  agentCount?: number;
  detail?: string;
  error?: string;
}

export async function exportProject(projectId: string, includeHistory: boolean): Promise<Blob> {
  const res = await apiClient.get<Blob>(API_ROUTES.saveExport, {
    params: { projectId, ...(includeHistory ? { history: 1 } : {}) },
    responseType: "blob",
  });
  return res.data;
}

export async function importState(snapshot: unknown): Promise<ImportResult> {
  const res = await apiClient.post<ImportResult>(API_ROUTES.saveImport, snapshot);
  return res.data;
}
