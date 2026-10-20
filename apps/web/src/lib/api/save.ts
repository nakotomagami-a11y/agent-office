/**
 * API module for export/import of app state (`/api/save/*`). Export returns a
 * binary JSON blob for download; import posts a parsed snapshot.
 */

import { API_ROUTES } from "@agent-office/api-contract";
import { apiClient } from "@/lib/api-client";

export interface ImportResult {
  projectId?: string;
  agentCount?: number;
  backedUp?: string[];
  officeRestored?: boolean;
  snapshot?: string | null;
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

export async function importState(snapshot: unknown, restoreOffice: boolean): Promise<ImportResult> {
  const res = await apiClient.post<ImportResult>(API_ROUTES.saveImport, snapshot, {
    params: restoreOffice ? { office: 1 } : {},
  });
  return res.data;
}
