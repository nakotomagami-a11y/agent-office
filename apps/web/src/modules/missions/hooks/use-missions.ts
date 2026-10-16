"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_ROUTES } from "@agent-office/api-contract";
import type { HubView, MissionView } from "@agent-office/domain/types";
import { apiFetch } from "@/lib/api/fetch";
import { queryKeys } from "@/lib/api/query-keys";
import { POLL } from "@/lib/polling";

/** Which mission seat this chat is. Local on the server, so cheap; it changes only on claim/leave. */
export function useMissionSeat(instanceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.missions.seat(instanceId ?? "none"),
    queryFn: () => apiFetch<{ seat: { missionId: string; seat: string } | null }>(
      `${API_ROUTES.missionSeat}?instanceId=${encodeURIComponent(instanceId ?? "")}`,
    ),
    enabled: !!instanceId,
    staleTime: 60_000,
  });
}

/** Folded fresh from GitHub on every fetch. `missions:changed` refreshes it; the safety net covers
 *  posts from other devices, which this server learns of only on its poller's next tick. */
export function useMission(missionId: string | null) {
  return useQuery({
    queryKey: queryKeys.missions.detail(missionId ?? "none"),
    queryFn: () => apiFetch<MissionView>(API_ROUTES.mission(missionId ?? "")),
    enabled: !!missionId,
    refetchInterval: (q) => (q.state.data?.closed ? false : POLL.SAFETY_NET),
  });
}

export function useJoinableHubs(projectId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.missions.hubs(projectId ?? "none"),
    queryFn: () => apiFetch<HubView[]>(`${API_ROUTES.missions}?projectId=${encodeURIComponent(projectId ?? "")}`),
    enabled: enabled && !!projectId,
  });
}

function useMissionMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.missions.all }) });
}

const post = (url: string, body: unknown) => apiFetch<unknown>(url, { method: "POST", body: JSON.stringify(body) });

export interface StartMissionInput {
  projectId: string;
  title: string;
  goal: string;
  budgetUsd: number;
  capUsd: number;
  seats: Array<{ seat: string; agent: string; os: string; brief: string }>;
}

export function useStartMission() {
  return useMissionMutation((input: StartMissionInput) =>
    apiFetch<{ missionId: string; pr: number; url: string; instanceId: string }>(API_ROUTES.missions, { method: "POST", body: JSON.stringify(input) }));
}

export function useClaimSeat() {
  return useMissionMutation((v: { projectId: string; pr: number; seat: string; capUsd: number; manifestHash: string }) => post(API_ROUTES.missionClaim, v));
}

export function useMissionActions(missionId: string) {
  return {
    decideClaim: useMissionMutation((v: { claimId: number; accept: boolean }) => post(API_ROUTES.missionClaimDecision(missionId, v.claimId), { accept: v.accept })),
    answer: useMissionMutation((v: { askId: number; text: string }) => post(API_ROUTES.missionAsk(missionId, v.askId), { text: v.text })),
    act: useMissionMutation((v: { act: "pause" | "resume" | "close"; seats: string[] }) => post(API_ROUTES.missionAct(missionId), v)),
    leave: useMissionMutation((seat: string) => post(API_ROUTES.missionLeave(missionId), { seat })),
    raiseCap: useMissionMutation((v: { seat: string; byUsd: number }) => post(API_ROUTES.missionCap(missionId), v)),
  };
}
