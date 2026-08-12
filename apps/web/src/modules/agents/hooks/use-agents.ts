"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { AgentBody, ApiAgent } from "@agent-office/domain/types";

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents.list(),
    queryFn: () => apiFetch<ApiAgent[]>(API_ROUTES.agents),
  });
}

export function useAgent(id: string | null) {
  return useQuery({
    queryKey: queryKeys.agents.detail(id ?? "__none"),
    queryFn: () => apiFetch<ApiAgent>(API_ROUTES.agent(id!)),
    enabled: !!id,
  });
}

export function useAgentBody(id: string | null) {
  return useQuery({
    queryKey: queryKeys.agents.body(id ?? "__none"),
    queryFn: () => apiFetch<string>(API_ROUTES.agentBody(id!), { asText: true }),
    enabled: !!id,
  });
}

export function useAgentMemory(id: string | null) {
  return useQuery({
    queryKey: queryKeys.agents.memory(id ?? "__none"),
    queryFn: () => apiFetch<string>(API_ROUTES.agentMemory(id!), { asText: true }),
    enabled: !!id,
  });
}

export function useWriteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AgentBody) =>
      apiFetch<{ id: string }>(API_ROUTES.agent(body.id), {
        method: "PUT",
        body,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.agents.all });
      qc.invalidateQueries({ queryKey: queryKeys.agents.detail(vars.id) });
      qc.invalidateQueries({ queryKey: queryKeys.agents.body(vars.id) });
    },
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AgentBody) =>
      apiFetch<{ id: string }>(API_ROUTES.agents, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.agents.all });
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: string }>(API_ROUTES.agent(id), { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.agents.all });
    },
  });
}

export function useWriteAgentMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      apiFetch<string>(API_ROUTES.agentMemory(id), {
        method: "PUT",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: content,
        asText: true,
      }),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.agents.memory(id) });
    },
  });
}
