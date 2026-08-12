"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { Project } from "@agent-office/domain/types";

export type FrontendChoice = "none" | "next" | "vite" | "react";
export type BackendChoice = "none" | "node" | "python";

export interface BootstrapInput {
  name: string;
  slug?: string;
  description?: string;
  frontend: FrontendChoice;
  backend: BackendChoice;
  initGit?: boolean;
}

export interface BootstrapResult {
  slug: string;
  path: string;
  fileCount: number;
  gitInitialized: boolean;
  project: Project | null;
  warning?: string;
}

export function useBootstrapProject() {
  const qc = useQueryClient();
  return useMutation<BootstrapResult, Error, BootstrapInput>({
    mutationFn: (body) =>
      apiFetch<BootstrapResult>(API_ROUTES.projectsBootstrap, { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.all });
    },
  });
}
