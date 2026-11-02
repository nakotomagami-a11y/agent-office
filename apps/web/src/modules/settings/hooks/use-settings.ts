"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/fetch";
import { queryKeys } from "@/lib/api/query-keys";
import { API_ROUTES } from "@agent-office/api-contract";
import type { AppSettings, ScannedEntry } from "@agent-office/domain/types";

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings.detail(),
    queryFn: () => apiFetch<AppSettings | null>(API_ROUTES.settings),
  });
}

export function useScanProjects(root: string, excluded: string[]) {
  const params = new URLSearchParams();
  params.set("root", root);
  if (excluded.length > 0) params.set("excluded", excluded.join(","));
  params.set("includeExcluded", "1");
  return useQuery({
    queryKey: queryKeys.settings.scan(root, excluded),
    queryFn: () => apiFetch<ScannedEntry[]>(`${API_ROUTES.settingsScan}?${params.toString()}`),
    enabled: root.length > 0,
  });
}

export function useWriteSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (next: { projectsRoot: string; excluded: string[] }) =>
      apiFetch<AppSettings>(API_ROUTES.settings, { method: "PUT", body: next }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}

type SettingsPatch = Partial<Pick<AppSettings, "features" | "integrations" | "firstRunComplete">>;

/** Merge-patch feature flags, integration toggles, or first-run state. */
export function usePatchSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) =>
      apiFetch<AppSettings>(API_ROUTES.settings, { method: "PATCH", body: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}
