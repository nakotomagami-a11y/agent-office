"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import { POLL } from "@/lib/polling";
import { toast } from "@/lib/toast-store";
import type { AgentInstance, Project, ProjectMetaPatch, ProjectSummary } from "@agent-office/domain/types";
import { getGitStatus } from "@/lib/api/dev-server";
import type { GitStatus } from "@agent-office/domain/types";

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: () => apiFetch<ProjectSummary[]>(API_ROUTES.projects),
    // Mounted in the always-visible top bar. Project-list changes are
    // user-driven and already invalidate on mutation, so this is only a safety
    // net — poll lazily (60s) instead of every 10s.
    refetchInterval: POLL.SAFETY_NET,
  });
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: queryKeys.projects.detail(id ?? "__none"),
    queryFn: () => apiFetch<Project>(API_ROUTES.project(id!)),
    enabled: !!id,
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { meta?: ProjectMetaPatch; memory?: string } }) => {
      // Only DETAIL callers have a rev; list-only callers (picker, settings)
      // send none and still get last-write-wins.
      const cached = qc.getQueryData<Project>(queryKeys.projects.detail(id));
      const body = cached?.rev ? { ...patch, expectedRev: cached.rev } : patch;
      return apiFetch<Project>(API_ROUTES.project(id), { method: "PUT", body });
    },
    onSuccess: (project, vars) => {
      // MERGE, never replace: PUT returns a narrower shape than GET, so
      // replacing dropped runCount, lastRunAt and the repair badges.
      qc.setQueryData<Project>(queryKeys.projects.detail(vars.id), (old) =>
        old ? { ...old, ...project } : project);

      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(vars.id) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.list() });
    },
    onError: (err, vars) => {
      // type:"all" — an inactive query would otherwise keep the dead rev.
      void qc.refetchQueries({ queryKey: queryKeys.projects.detail(vars.id), type: "all" });
      // Central, so no caller can drop a refused write silently.
      const code = err instanceof Error ? err.message : "";
      if (code === "stale_write") {
        toast("This project changed somewhere else — reloaded it, please retry.");
      } else if (code === "metadata_unreadable") {
        toast("This project's project.md could not be read, so it was not overwritten. Fix the file by hand.");
      }
    },
  });
}

/**
 * Permanently delete a project's folder from disk (rm -rf) plus its metadata.
 * Irreversible — callers must gate this behind an explicit confirmation. Also
 * refreshes the settings scan so the removed folder disappears from the list.
 */
export function useRemoveProjectFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ removed: string }>(API_ROUTES.projectFolder(id), { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}

export function useAddInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, agentId, init, force }: { projectId: string; agentId: string; init?: Partial<AgentInstance>; force?: boolean }) =>
      apiFetch<{ project: Project; instance: AgentInstance }>(API_ROUTES.projectRoster(projectId), {
        method: "POST",
        body: { agentId, init, force },
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(vars.projectId) });
    },
  });
}

export function useUpdateInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      instanceId,
      patch,
    }: {
      projectId: string;
      instanceId: string;
      patch: { label?: string; model?: string; effort?: string; permissionMode?: string; playwrightEnabled?: boolean; room?: string };
    }) =>
      apiFetch<AgentInstance>(API_ROUTES.projectRosterItem(projectId, instanceId), {
        method: "PATCH",
        body: patch,
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(vars.projectId) });
    },
  });
}

export function useRemoveInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, instanceId }: { projectId: string; instanceId: string }) =>
      apiFetch<Project>(API_ROUTES.projectRosterItem(projectId, instanceId), { method: "DELETE" }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
      qc.invalidateQueries({ queryKey: queryKeys.projects.detail(vars.projectId) });
    },
  });
}

export function useGitStatus(projectId: string | null, hasCwd: boolean) {
  return useQuery<GitStatus>({
    queryKey: ["git-status", projectId],
    queryFn: () => getGitStatus(projectId!),
    enabled: !!projectId && hasCwd,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}

