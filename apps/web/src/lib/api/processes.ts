/**
 * API module for the long-running process manager (dev servers, builds) exposed
 * under `/api/processes`.
 */

import { API_ROUTES } from "@agent-office/api-contract";
import { apiClient } from "@/lib/api-client";
import type { ProcessInfo } from "@agent-office/domain/types";

export type { ProcessInfo };

export async function listProcesses(): Promise<ProcessInfo[]> {
  const res = await apiClient.get<ProcessInfo[]>(API_ROUTES.processes);
  return res.data;
}

export async function getProcess(pid: number): Promise<{ alive?: boolean }> {
  const res = await apiClient.get<{ alive?: boolean }>(API_ROUTES.process(pid));
  return res.data;
}

export async function killProcess(pid: number): Promise<void> {
  await apiClient.delete(API_ROUTES.process(pid));
}
