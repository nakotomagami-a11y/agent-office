/**
 * API module for the dev-tools seed/stats endpoint (`/api/dev/seed`). Only the
 * developer menu consumes this.
 */

import { API_ROUTES } from "@agent-office/domain/config/routes";
import { apiClient } from "@/lib/api-client";

export type SeedAction = "office" | "memory" | "all" | "clear" | "clear-all-runs" | "fix-orphans" | "showcase" | "clear-showcase";

export interface DbStats {
  runsCount: number;
  messagesCount: number;
  orphansCount: number;
  dbSizeBytes: number;
  agentsCount: number;
  dbPath: string;
}

export async function getDbStats(): Promise<DbStats> {
  const res = await apiClient.get<DbStats>(API_ROUTES.devSeed);
  return res.data;
}

export async function runSeed(action: SeedAction): Promise<string> {
  const res = await apiClient.post<{ message?: string }>(API_ROUTES.devSeed, { action });
  return res.data.message ?? "Done.";
}
