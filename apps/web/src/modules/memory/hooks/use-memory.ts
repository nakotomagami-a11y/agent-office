"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assertNever } from "@/lib/assert-never";
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
  switch (scope.kind) {
    case "global": return API_ROUTES.memoryGlobal;
    case "project": return API_ROUTES.projectMemory(scope.id);
    case "agent": return API_ROUTES.agentMemory(scope.id);
    case "agent-skill": return API_ROUTES.skill(scope.skillSlug);
    default: return assertNever(scope);
  }
}

function queryKeyFor(scope: MemoryScope): readonly unknown[] {
  switch (scope.kind) {
    case "global": return ["memory", "global"];
    case "project": return ["memory", "project", scope.id];
    case "agent": return ["memory", "agent", scope.id];
    case "agent-skill": return ["memory", "skill", scope.skillSlug];
    default: return assertNever(scope);
  }
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
