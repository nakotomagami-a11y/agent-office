"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { API_ROUTES } from "@agent-office/domain/config/routes";

export const CLEANUP_KINDS = [
  "transcripts",
  "drafts",
  "orphaned-runs",
  "agent-memory",
  "user-analysis",
  "skill-cache",
  "ui-settings",
  "everything",
] as const;

export type CleanupKind = (typeof CLEANUP_KINDS)[number];

export interface CleanupResult {
  cleared: number;
  detail?: Record<string, number>;
}

export function useCleanup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind: CleanupKind) =>
      apiFetch<CleanupResult>(API_ROUTES.cleanup(kind), { method: "POST" }),
    onSuccess: (_data, kind) => {
      // Invalidate everything that could reflect a cleanup — cheapest correct
      // strategy for a low-frequency mutation.
      if (kind === "everything") {
        qc.invalidateQueries();
        return;
      }
      qc.invalidateQueries({ queryKey: ["runs"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
