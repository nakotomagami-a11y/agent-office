"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_ROUTES } from "@agent-office/api-contract";
import type { Provider, ProviderModels, ProviderStatusReason, ProviderTestResult } from "@agent-office/domain/types";
import { ApiError, apiFetch } from "@/lib/api/fetch";
import { queryKeys } from "@/lib/api/query-keys";
import { baseUrlProblem, canContinueAnyway, reasonOfError } from "../format/provider-format";
import { EMPTY_DRAFT, type Drafts, requestBody, startingDrafts, usesBaseUrl, type ProviderDraft } from "../format/provider-draft";
import { useProviders } from "./use-providers";

export interface SetupFailure {
  reason: ProviderStatusReason | null;
  /** The raw machine code when it is not a provider reason (e.g. `provider_required`). */
  code: string | null;
}

/** What the wizard persists in its draft: never a key. */
export interface PersistedChoice {
  provider: Provider | null;
  baseUrl: string;
  models: ProviderModels;
}

type Phase = "idle" | "testing" | "saving";

/** Picked provider, per-provider drafts and the last verdict. Any edit drops the verdict: a stale OK must not authorise Next. */
function useSetupState(initial: PersistedChoice | undefined, ready: boolean) {
  const providersQ = useProviders();
  const data = providersQ.data;
  const [choice, setChoiceState] = useState<Provider | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [outcome, setOutcome] = useState<ProviderTestResult | null>(null);
  const [failure, setFailure] = useState<SetupFailure | null>(null);
  const hydrated = useRef(false);
  const seed = useRef(initial);
  seed.current = initial;

  useEffect(() => {
    if (hydrated.current || !data || !ready) return;
    hydrated.current = true;
    const start = startingDrafts(data, seed.current);
    setChoiceState(start.choice);
    setDrafts(start.drafts);
  }, [data, ready]);

  const view = useMemo(() => data?.providers.find((v) => v.id === choice), [data, choice]);
  const draft = (choice && drafts[choice]) || EMPTY_DRAFT;

  const setChoice = useCallback((p: Provider) => {
    // A key typed for a provider the user leaves is dropped, so no abandoned key lingers in memory.
    setDrafts((prev) => (choice && prev[choice] ? { ...prev, [choice]: { ...prev[choice], apiKey: "" } } : prev));
    setChoiceState(p);
    setOutcome(null);
    setFailure(null);
  }, [choice]);
  const edit = useCallback(
    (patch: Partial<ProviderDraft>) => {
      if (!choice) return;
      setDrafts((prev) => ({ ...prev, [choice]: { ...(prev[choice] ?? EMPTY_DRAFT), ...patch } }));
      setOutcome(null);
      setFailure(null);
    },
    [choice],
  );
  const clearKey = useCallback(() => {
    if (choice) setDrafts((prev) => ({ ...prev, [choice]: { ...(prev[choice] ?? EMPTY_DRAFT), apiKey: "" } }));
  }, [choice]);

  return { providersQ, data, choice, setChoice, view, draft, edit, clearKey, outcome, setOutcome, failure, setFailure };
}

type State = ReturnType<typeof useSetupState>;

/** Test the draft (or, with none, the stored config). Plain async, so a key never enters the mutation cache. */
function useRunTest(s: State, setPhase: (p: Phase) => void, refresh: () => Promise<void>) {
  const { choice, draft, view, setOutcome, setFailure } = s;
  return useCallback(async (): Promise<ProviderTestResult | null> => {
    if (!choice) return null;
    setPhase("testing");
    setFailure(null);
    const body = choice === "subscription" ? null : requestBody(choice, draft, view);
    try {
      const result = await apiFetch<ProviderTestResult>(API_ROUTES.providerTest(choice), {
        method: "POST",
        body: body ? { draft: body } : {},
      });
      setOutcome(result);
      void refresh();
      return result;
    } catch (err) {
      setOutcome(null);
      setFailure({ reason: reasonOfError(err), code: err instanceof ApiError ? err.message : "unreachable" });
      return null;
    } finally {
      setPhase("idle");
    }
  }, [choice, draft, view, setOutcome, setFailure, setPhase, refresh]);
}

const failureOf = (err: unknown): SetupFailure => {
  const reason = reasonOfError(err);
  return { reason, code: reason ? null : err instanceof ApiError ? err.message : "unknown" };
};

/** Save the config, then select. True only once the server answered 200 for the selection. */
function useCommit(s: State, runTest: () => Promise<ProviderTestResult | null>, setPhase: (p: Phase) => void, refresh: () => Promise<void>) {
  const { choice, draft, view, outcome, setFailure, clearKey } = s;
  return useCallback(
    async (acceptUnavailable = false): Promise<boolean> => {
      if (!choice || (usesBaseUrl(choice) && baseUrlProblem(draft.baseUrl))) return false;
      const result = outcome ?? (await runTest());
      if (!result || (!result.ok && !acceptUnavailable)) return false;
      setPhase("saving");
      try {
        const body = choice === "subscription" ? null : requestBody(choice, draft, view);
        if (body) await apiFetch(API_ROUTES.provider(choice), { method: "PUT", body });
        const selection = acceptUnavailable ? { provider: choice, acceptUnavailable: true } : { provider: choice };
        await apiFetch(API_ROUTES.providersSelected, { method: "PUT", body: selection });
        clearKey();
        await refresh();
        return true;
      } catch (err) {
        setFailure(failureOf(err));
        void refresh();
        return false;
      } finally {
        setPhase("idle");
      }
    },
    [choice, draft, outcome, runTest, view, setFailure, clearKey, setPhase, refresh],
  );
}

function useSetupActions(s: State) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: queryKeys.providers.all }), [qc]);
  const runTest = useRunTest(s, setPhase, refresh);
  const commit = useCommit(s, runTest, setPhase, refresh);
  return { phase, runTest, commit };
}

/**
 * The state behind both the wizard step and the Settings tab. Nothing is shown as
 * active until the server has accepted it (no optimistic switch). `ready` holds
 * hydration back until a stored wizard draft has loaded, so it cannot lose a race
 * to the server read.
 */
export function useProviderSetup(initial?: PersistedChoice, ready = true) {
  const s = useSetupState(initial, ready);
  const { phase, runTest, commit } = useSetupActions(s);
  const blockedReason: ProviderStatusReason | undefined =
    (s.outcome && !s.outcome.ok ? s.outcome.reason : undefined) ?? s.failure?.reason ?? undefined;
  const persisted: PersistedChoice = useMemo(
    () => ({ provider: s.choice, baseUrl: s.draft.baseUrl, models: s.draft.models }),
    [s.choice, s.draft.baseUrl, s.draft.models],
  );
  return {
    data: s.data,
    loading: s.providersQ.isLoading,
    loadError: s.providersQ.isError,
    refetch: s.providersQ.refetch,
    choice: s.choice,
    setChoice: s.setChoice,
    view: s.view,
    draft: s.draft,
    edit: s.edit,
    outcome: s.outcome,
    failure: s.failure,
    phase,
    busy: phase !== "idle",
    runTest,
    commit,
    blockedReason,
    canContinueAnyway: canContinueAnyway(blockedReason),
    persisted,
  };
}

export type ProviderSetup = ReturnType<typeof useProviderSetup>;
