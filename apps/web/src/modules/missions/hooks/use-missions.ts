"use client";

import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { z } from "zod";
import { API_ROUTES, type missionActSchema, type missionClaimSchema, type missionStartSchema } from "@agent-office/api-contract";
import type { HubView, MissionView } from "@agent-office/domain/types";
import { apiFetch } from "@/lib/api/fetch";
import { queryKeys } from "@/lib/api/query-keys";
import { POLL } from "@/lib/polling";
import { toast } from "@/lib/toast-store";
import { missionFailure } from "../format/mission-errors";
import { useMissionErrorText } from "./use-mission-error";

export type StartMissionInput = z.input<typeof missionStartSchema>;
export type ClaimSeatInput = z.input<typeof missionClaimSchema>;
export type MissionActInput = z.input<typeof missionActSchema>;
export interface StartedResponse { missionId: string; pr: number; url: string; instanceId: string }

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
 *  posts from other devices, which this server learns of only on its poller's next tick.
 *  `enabled`: a hidden dialog must not keep polling GitHub. */
export function useMission(missionId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.missions.detail(missionId ?? "none"),
    queryFn: () => apiFetch<MissionView>(API_ROUTES.mission(missionId ?? "")),
    enabled: enabled && !!missionId,
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

/** `onError` here, not only at the call site: a call site's callback dies with its component, and
 *  the pill's panel can close before GitHub answers. `repo_public` is a question, not a failure. */
function useMissionMutation<V, R>(fn: (v: V) => Promise<R>, affected: (v: V) => QueryKey[]) {
  const qc = useQueryClient();
  const t = useTranslations("missions");
  const errorText = useMissionErrorText();
  return useMutation({
    mutationFn: fn,
    onError: (e) => {
      if (missionFailure(e).key !== "repo_public") toast(t("toast_failed", { reason: errorText(e) }));
    },
    onSettled: (_r, _e, v) => {
      for (const queryKey of affected(v)) void qc.invalidateQueries({ queryKey });
    },
  });
}

const post = (url: string, body: unknown) => apiFetch<unknown>(url, { method: "POST", body });

export function useStartMission() {
  return useMissionMutation(
    (input: StartMissionInput) => apiFetch<StartedResponse>(API_ROUTES.missions, { method: "POST", body: input }),
    // The coordinator's chat joins the project's roster.
    (v) => [queryKeys.missions.hubs(v.projectId), queryKeys.projects.all],
  );
}

export function useClaimSeat() {
  return useMissionMutation(
    (v: ClaimSeatInput) => post(API_ROUTES.missionClaim, v),
    (v) => [queryKeys.missions.hubs(v.projectId), queryKeys.projects.all],
  );
}

export function useMissionActions(missionId: string, projectId: string) {
  const detail = queryKeys.missions.detail(missionId);
  const seats = [detail, queryKeys.missions.hubs(projectId)];
  return {
    decideClaim: useMissionMutation((v: { claimId: number; accept: boolean }) => post(API_ROUTES.missionClaimDecision(missionId, v.claimId), { accept: v.accept }), () => seats),
    answer: useMissionMutation((v: { askId: number; text: string }) => post(API_ROUTES.missionAsk(missionId, v.askId), { text: v.text }), () => [detail]),
    act: useMissionMutation((v: MissionActInput) => post(API_ROUTES.missionAct(missionId), v), () => seats),
    leave: useMissionMutation(
      (v: { seat: string; instanceId: string }) => post(API_ROUTES.missionLeave(missionId), { seat: v.seat }),
      (v) => [...seats, queryKeys.missions.seat(v.instanceId), queryKeys.projects.all],
    ),
    raiseCap: useMissionMutation((v: { seat: string; byUsd: number }) => post(API_ROUTES.missionCap(missionId), v), () => [detail]),
  };
}
