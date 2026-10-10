"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/fetch";
import type { ProcessInfo } from "@agent-office/domain/types";
import { API_ROUTES } from "@agent-office/api-contract";

export type { ProcessInfo };

const PROCESSES_KEY = ["processes"] as const;

export function useProcesses(enabled: boolean) {
  return useQuery({
    queryKey: PROCESSES_KEY,
    queryFn: () => apiFetch<ProcessInfo[]>(API_ROUTES.processes),
    refetchInterval: enabled ? 5000 : false,
    enabled,
  });
}
