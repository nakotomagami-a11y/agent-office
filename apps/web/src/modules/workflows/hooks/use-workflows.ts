"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { Workflow } from "@agent-office/domain/types";

export function useWorkflows(opts?: { category?: string; q?: string }) {
  const params = new URLSearchParams();
  if (opts?.category) params.set("category", opts.category);
  if (opts?.q) params.set("q", opts.q);
  const qs = params.toString();
  const url = qs ? `${API_ROUTES.workflows}?${qs}` : API_ROUTES.workflows;
  return useQuery({
    queryKey: queryKeys.workflows.list(opts),
    queryFn: () => apiFetch<Workflow[]>(url),
  });
}

export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; body: string; category?: string }) =>
      apiFetch<Workflow>(API_ROUTES.workflows, { method: "POST", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workflows.all });
    },
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(API_ROUTES.workflowById(id), { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workflows.all });
    },
  });
}

export function useRecordWorkflowUsage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(API_ROUTES.workflowUse(id), { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workflows.all });
    },
  });
}
