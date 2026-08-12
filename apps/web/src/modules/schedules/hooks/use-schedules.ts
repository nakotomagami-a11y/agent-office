"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { ScheduledJob, SummonRequest } from "@agent-office/domain/types";

const KEY = ["schedules"] as const;

export function useSchedules() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await apiFetch<{ jobs: ScheduledJob[] }>(API_ROUTES.schedules)).jobs,
    refetchInterval: 15_000,
  });
}

export interface CreateScheduleInput {
  fireAt: number;
  summonRequest: SummonRequest;
  reason?: "manual" | "rate-limit";
  label?: string;
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateScheduleInput) =>
      apiFetch<{ job: ScheduledJob }>(API_ROUTES.schedules, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCancelSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(API_ROUTES.schedule(id), { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRunScheduleNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ job: ScheduledJob }>(API_ROUTES.scheduleRun(id), { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReassignSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, target }: { id: string; target: { agentId?: string; projectId?: string; instanceId?: string } }) =>
      apiFetch<{ job: ScheduledJob }>(API_ROUTES.schedule(id), { method: "PATCH", body: JSON.stringify(target) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
