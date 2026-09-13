"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { AgentBody, ApiAgent, ContextCostBreakdown } from "@agent-office/domain/types";

/** "Context & Cost" tab data for one agent+instance — see
 *  `@agent-office/domain` services/agents/context-cost.ts. Polled (not a
 *  one-shot fetch): its numbers depend on the LATEST finished run (memory
 *  files can change, and native-overhead only becomes a real measurement
 *  once a run completes) — without polling, a tab left open across a run
 *  finishing would keep showing a stale snapshot from before it did. */
export function useContextCost(agentId: string | null, instanceId: string | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.agents.contextCost(agentId ?? "__none", instanceId, projectId),
    queryFn: () => {
      const qs = new URLSearchParams();
      if (instanceId) qs.set("instanceId", instanceId);
      if (projectId) qs.set("projectId", projectId);
      const suffix = qs.toString();
      return apiFetch<ContextCostBreakdown>(`${API_ROUTES.agentContextCost(agentId!)}${suffix ? `?${suffix}` : ""}`);
    },
    enabled: !!agentId,
    refetchInterval: 5000,
  });
}

/** "Measure exactly" — spawns a real throwaway probe (~10-15s, a little real
 *  spend) to split native overhead into CC base+tools vs. MCP for real. See
 *  `@agent-office/domain` services/agents/context-cost-measure.ts. */
export function useMeasureContextCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, instanceId, projectId }: { agentId: string; instanceId: string | undefined; projectId: string | undefined }) =>
      apiFetch(API_ROUTES.agentContextCostMeasure(agentId), { method: "POST", body: { instanceId, projectId } }),
    onSuccess: () => {
      // Agent-scoped, but the query key is per agent+instance+project — just
      // invalidate everything under "context-cost" rather than reconstruct
      // every instance key that might be showing this agent right now.
      void qc.invalidateQueries({ queryKey: [...queryKeys.agents.all, "context-cost"] });
    },
  });
}

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
