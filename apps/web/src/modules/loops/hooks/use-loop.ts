"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { LoopRow } from "@agent-office/domain/services/db/loops";

export type LoopAction = "stop" | "acceptAsIs" | "allowOneMore";

/** Driven by the app-wide SSE `loops:changed` event, which the service emits on
 *  every real state change — no poll. */
export function useLoop(id: string | null) {
  return useQuery({
    queryKey: queryKeys.loops.detail(id ?? "none"),
    queryFn: () => apiFetch<LoopRow>(API_ROUTES.loop(id as string)),
    enabled: !!id,
  });
}

/** The three interventions. A refusal comes back 409 with a `detail` the caller
 *  can show — the API deliberately does not report a no-op as success. */
export function useLoopAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: LoopAction) =>
      apiFetch<LoopRow>(API_ROUTES.loop(id), { method: "PATCH", body: JSON.stringify({ action }) }),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.loops.detail(id) }),
  });
}
