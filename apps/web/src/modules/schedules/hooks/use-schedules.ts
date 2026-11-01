"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/fetch";
import { API_ROUTES } from "@agent-office/api-contract";
import type { ScheduledJob, ScheduleRepeatEvery, SummonRequest } from "@agent-office/domain/types";
import { POLL } from "@/lib/polling";
import { toast } from "@/lib/toast-store";
import { scheduleErrorText } from "../format/schedule-format";

const failed = (what: string) => (err: unknown) => toast(`Couldn't ${what}: ${scheduleErrorText(err)}`);

const KEY = ["schedules"] as const;

export function useSchedules() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await apiFetch<{ jobs: ScheduledJob[] }>(API_ROUTES.schedules)).jobs,
    // Driven by the app-wide SSE "schedules:changed" event (scheduler ticks);
    // slow reconnect safety net.
    refetchInterval: POLL.SAFETY_NET,
  });
}

export interface CreateScheduleInput {
  fireAt: number;
  summonRequest: SummonRequest;
  reason?: "manual" | "rate-limit";
  label?: string;
  repeat?: ScheduleRepeatEvery;
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
    onError: failed("cancel the order"),
  });
}

export function useRunScheduleNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ job: ScheduledJob }>(API_ROUTES.scheduleRun(id), { method: "POST" }),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: failed("run the order"),
  });
}

export function useReassignSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, target }: { id: string; target: { agentId?: string; projectId?: string; instanceId?: string } }) =>
      apiFetch<{ job: ScheduledJob }>(API_ROUTES.schedule(id), { method: "PATCH", body: JSON.stringify(target) }),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: failed("reassign the order"),
  });
}
