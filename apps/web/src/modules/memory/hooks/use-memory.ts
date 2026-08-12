"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { match } from "ts-pattern";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { API_ROUTES } from "@agent-office/domain/config/routes";

// ─── Scope type ───────────────────────────────────────────────────────────────

export type MemoryScope =
  | { kind: "global" }
  | { kind: "project"; id: string; name: string }
  | { kind: "agent"; id: string; name: string }
  | { kind: "agent-skill"; agentId: string; skillSlug: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function endpointFor(scope: MemoryScope): string {
  return match(scope)
    .with({ kind: "global" }, () => API_ROUTES.memoryGlobal)
    .with({ kind: "project" }, (s) => API_ROUTES.projectMemory(s.id))
    .with({ kind: "agent" }, (s) => API_ROUTES.agentMemory(s.id))
    .with({ kind: "agent-skill" }, (s) => API_ROUTES.skill(s.skillSlug))
    .exhaustive();
}

function queryKeyFor(scope: MemoryScope): readonly unknown[] {
  return match(scope)
    .with({ kind: "global" }, () => ["memory", "global"] as const)
    .with({ kind: "project" }, (s) => ["memory", "project", s.id] as const)
    .with({ kind: "agent" }, (s) => ["memory", "agent", s.id] as const)
    .with({ kind: "agent-skill" }, (s) => ["memory", "skill", s.skillSlug] as const)
    .exhaustive();
}

export function isReadOnly(scope: MemoryScope): boolean {
  return scope.kind === "agent-skill";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export type UseMemoryReturn = {
  content: string;
  isLoading: boolean;
  loadError: Error | null;
  /** Persist text to the remote endpoint. */
  save: (text: string) => Promise<void>;
  isSaving: boolean;
  saveError: Error | null;
};

export function useMemory(scope: MemoryScope): UseMemoryReturn {
  const qc = useQueryClient();
  const url = endpointFor(scope);
  const qKey = queryKeyFor(scope);

  const query = useQuery({
    queryKey: qKey,
    queryFn: async () => {
      // Skill preview returns InstalledSkill JSON — pluck `.body` so the
      // editor treats it as plain markdown text like every other scope.
      if (scope.kind === "agent-skill") {
        const s = await apiFetch<{ body?: string }>(url);
        return s.body ?? "";
      }
      return apiFetch<string>(url, { asText: true });
    },
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: (text: string) =>
      apiFetch<string>(url, {
        method: "PUT",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: text,
        asText: true,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qKey });
    },
  });

  return {
    content: query.data ?? "",
    isLoading: query.isLoading,
    loadError: query.error,
    save: async (text: string) => { await mutation.mutateAsync(text); },
    isSaving: mutation.isPending,
    saveError: mutation.error,
  };
}
