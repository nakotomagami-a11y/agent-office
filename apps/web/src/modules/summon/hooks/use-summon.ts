"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { SummonRequest } from "@agent-office/domain/types";
import { useChatStateRegistry } from "../state/chat-state-registry";
import { transcriptKey } from "../format/transcript-store";

export interface SummonResponse {
  runId: string;
  warning?: string;
}

export function useSummon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: SummonRequest) =>
      apiFetch<SummonResponse>(API_ROUTES.summon, { method: "POST", body: req }),
    // These run via `Mutation.execute()`'s hook-level `this.options.onSuccess`
    // / `onError`, NOT the per-call `.mutate(vars, { onSuccess })` callback
    // that `doSubmit` (use-chat-actions.ts) passes. That distinction matters:
    // TanStack Query's `MutationObserver.notify_fn` gates the *per-call*
    // callback behind `hasListeners()`, so it's silently skipped once the
    // ChatPanel that issued the request has unmounted (e.g. a project-tab
    // switch mid-request) — but the POST already went through and the server
    // already spawned the `claude` process (see `summon-run.ts`). Without
    // this, the client would never learn the run's id: `activeRunId` stays
    // null and `phaseOverride` stays stuck at "sending" forever for that
    // tKey, the queue behind it never drains, and a later retry hits no
    // client-side guard against re-spawning (the server-side guard in
    // `startSummonRun` is the backstop for that half).
    //
    // Writing straight into the registry — instead of relying on the
    // component's setters — means this update lands even if every ChatPanel
    // for this tKey is currently unmounted.
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.runs.all });
      qc.invalidateQueries({ queryKey: queryKeys.agents.prompts(vars.agentId) });
      const tKey = transcriptKey(vars.agentId, vars.instanceId);
      useChatStateRegistry.getState().patchEntry(tKey, {
        activeRunId: data.runId,
        phaseOverride: null,
      });
    },
    onError: (_err, vars) => {
      const tKey = transcriptKey(vars.agentId, vars.instanceId);
      // Don't touch activeRunId here — the POST may have failed before or
      // after the server-side spawn decision; leaving it alone keeps a
      // legitimate resume-probe possible. Just un-stick the phase so the
      // panel (and the queue behind it) isn't stuck at "sending" forever.
      useChatStateRegistry.getState().patchEntry(tKey, { phaseOverride: null });
    },
  });
}

export function useAbortRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      apiFetch<{ aborted: boolean }>(API_ROUTES.runAbort(runId), { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.runs.all });
    },
  });
}
