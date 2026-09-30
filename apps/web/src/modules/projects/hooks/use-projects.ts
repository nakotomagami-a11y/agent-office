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

/**
 * `accountId: null` clears the field back to the default account. `undefined`
 * (or omitted) means "leave unchanged" — this matches how JSON.stringify
 * strips undefined values, so callers pass explicit `null` to wipe.
 *
 * Imported from the domain rather than re-declared: the local `Omit<...>`
 * version still permitted `roster`, so a caller could pass one, typecheck,
 * get a 200, and have zod silently strip it.
 */

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { meta?: ProjectMetaPatch; memory?: string } }) => {
      // Attach the rev of the copy this client last read, so a write built on a
      // stale view is refused (409) instead of silently winning.
      //
      // NOTE: only callers that have loaded the project DETAIL have a rev.
      // List-only callers (project picker, settings page) send none and still
      // get last-write-wins — `ProjectSummary` does not carry a rev.
      const cached = qc.getQueryData<Project>(queryKeys.projects.detail(id));
      const body = cached?.rev ? { ...patch, expectedRev: cached.rev } : patch;
      return apiFetch<Project>(API_ROUTES.project(id), { method: "PUT", body });
    },
    onSuccess: (project, vars) => {
      // Seed the cache with the authoritative response so the NEXT write sends
      // a current rev. Invalidating alone is not enough: React Query's default
      // `refetchType: "active"` leaves an inactive detail query unrefetched,
      // so `getQueryData` would keep returning the old rev and every
      // subsequent write would 409 forever.
      if (project?.rev) qc.setQueryData(queryKeys.projects.detail(vars.id), project);
      else qc.invalidateQueries({ queryKey: queryKeys.projects.detail(vars.id) });
      qc.invalidateQueries({ queryKey: queryKeys.projects.list() });
    },
    onError: (err, vars) => {
      // A 409 means our copy was stale. Force a refetch even when the query is
      // inactive, otherwise the retry reuses the same doomed rev.
      void qc.refetchQueries({ queryKey: queryKeys.projects.detail(vars.id), type: "all" });
      // Surfaced centrally so every caller gets it: a refused write used to be
      // unreachable on this route, but it is now a routine outcome, and a
      // silently dropped write is just the original bug wearing a hat.
      if (err instanceof Error && err.message === "stale_write") {
        toast("This project changed somewhere else — reloaded it, please retry.");
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

