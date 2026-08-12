/**
 * API module for project runtime operations surfaced in the office toolbar:
 * dev-server detection/start, dependency install, production build, git status,
 * and the open-folder / clear-cache shortcuts.
 */

import { API_ROUTES } from "@agent-office/domain/config/routes";
import { apiClient } from "@/lib/api-client";
import type { DetectedCommand } from "@/app/api/projects/[id]/dev/route";
import type { GitStatus } from "@/app/api/projects/[id]/git-status/route";

export type { DetectedCommand, GitStatus };

export interface DevConfig {
  hasPackageJson: boolean;
  hasNodeModules: boolean;
  commands: DetectedCommand[];
}

export async function getDevConfig(projectId: string): Promise<DevConfig> {
  const res = await apiClient.get<DevConfig>(API_ROUTES.projectDev(projectId));
  return res.data;
}

export async function startDevCommand(
  projectId: string,
  commandKey: string,
): Promise<{ port?: number; url?: string; pid?: number }> {
  const res = await apiClient.post<{ port?: number; url?: string; pid?: number }>(
    API_ROUTES.projectDev(projectId),
    { commandKey },
  );
  return res.data;
}

export async function installDeps(projectId: string): Promise<{ installed: Array<{ dir: string; pm: string }> }> {
  const res = await apiClient.post<{ ok?: boolean; installed?: Array<{ dir: string; pm: string }> }>(
    API_ROUTES.projectInstall(projectId),
  );
  return { installed: res.data.installed ?? [] };
}

export async function getBuildInfo(projectId: string): Promise<{ hasBuild: boolean }> {
  const res = await apiClient.get<{ hasBuild: boolean }>(API_ROUTES.projectBuild(projectId));
  return res.data;
}

export async function startBuild(projectId: string): Promise<{ pid?: number | null }> {
  const res = await apiClient.post<{ pid?: number | null }>(API_ROUTES.projectBuild(projectId));
  return res.data;
}

export async function getGitStatus(projectId: string): Promise<GitStatus> {
  const res = await apiClient.get<GitStatus>(API_ROUTES.projectGitStatus(projectId));
  return res.data;
}

export async function clearBuildCache(projectId: string): Promise<void> {
  await apiClient.post(API_ROUTES.projectClearCache(projectId));
}

export async function openProjectFolder(projectId: string, app?: "code"): Promise<void> {
  await apiClient.post(API_ROUTES.projectOpenFolder(projectId), undefined, {
    params: app ? { app } : undefined,
  });
}
