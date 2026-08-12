/**
 * API module for the long-running process manager (dev servers, flutter runs,
 * builds) exposed under `/api/processes`.
 */

import { API_ROUTES } from "@agent-office/domain/config/routes";
import { apiClient } from "@/lib/api-client";
import type { ProcessInfo } from "@/app/api/processes/route";

export type { ProcessInfo };

export interface ProcessLogs {
  lines: string[];
  exitCode: number | null;
  found: boolean;
}

export async function listProcesses(): Promise<ProcessInfo[]> {
  const res = await apiClient.get<ProcessInfo[]>(API_ROUTES.processes);
  return res.data;
}

export async function getProcess(pid: number): Promise<{ alive?: boolean }> {
  const res = await apiClient.get<{ alive?: boolean }>(API_ROUTES.process(pid));
  return res.data;
}

export async function getProcessLogs(pid: number): Promise<ProcessLogs> {
  const res = await apiClient.get<ProcessLogs>(API_ROUTES.processLogs(pid));
  return res.data;
}

export async function killProcess(pid: number): Promise<void> {
  await apiClient.delete(API_ROUTES.process(pid));
}

export async function sendProcessStdin(pid: number, data: string): Promise<void> {
  await apiClient.post(API_ROUTES.processStdin(pid), { data });
}
