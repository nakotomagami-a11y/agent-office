"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import type { ProcessInfo } from "@/app/api/processes/route";

export type { ProcessInfo };

const PROCESSES_KEY = ["processes"] as const;

export function useProcesses(enabled: boolean) {
  return useQuery({
    queryKey: PROCESSES_KEY,
    queryFn: () => apiFetch<ProcessInfo[]>("/api/processes"),
    refetchInterval: enabled ? 5000 : false,
    enabled,
  });
}
