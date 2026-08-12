"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { match } from "ts-pattern";
import { useProcessesStore } from "@/lib/processes-store";
import { useCompareStore } from "@/lib/compare-store";
import { useOfficeStore, type AgentTab } from "@/modules/office/hooks/use-office-store";

const AGENT_TABS: AgentTab[] = ["conversation", "history", "memory", "settings"];
function isAgentTab(v: string | null): v is AgentTab {
  return AGENT_TABS.includes(v as AgentTab);
}

// Keys (besides "modal") that describe modal payloads; cleared unless kept.
const PAYLOAD_KEYS = ["run", "agent", "tab", "instance"] as const;
function clearPayload(sp: URLSearchParams, keep: readonly string[] = []) {
  for (const k of PAYLOAD_KEYS) if (!keep.includes(k)) sp.delete(k);
}

// The single source of truth for "which modal is open", resolved by priority
// from the independent modal stores.
type ModalState =
  | { kind: "processes" }
  | { kind: "compare"; runId: string }
  | { kind: "agent"; agentId: string; instanceId: string | null; tab: AgentTab | null }
  | { kind: "none" };

// Canonical string for a modal state. Two states with the same key are
// equivalent, so the reconciler below can tell whether the URL and the store
// already agree (→ do nothing) or diverged (→ figure out which side moved).
function modalKey(s: ModalState): string {
  return match(s)
    .with({ kind: "processes" }, () => "processes")
    .with({ kind: "compare" }, ({ runId }) => `compare:${runId}`)
    .with({ kind: "agent" }, ({ agentId, instanceId, tab }) =>
      `agent:${agentId}:${instanceId ?? ""}:${tab ?? "conversation"}`)
    .with({ kind: "none" }, () => "none")
    .exhaustive();
}

function modalStateFromUrl(sp: URLSearchParams): ModalState {
  return match(sp.get("modal"))
    .with("processes", () => ({ kind: "processes" }) as const)
    .with("compare", () => {
      const runId = sp.get("run");
      return runId ? ({ kind: "compare", runId }) as const : ({ kind: "none" }) as const;
    })
    .with("agent", () => {
      const agentId = sp.get("agent");
      if (!agentId) return { kind: "none" } as const;
      const tab = sp.get("tab");
      return {
        kind: "agent",
        agentId,
        instanceId: sp.get("instance"),
        tab: isAgentTab(tab) ? tab : null,
      } as const;
    })
    .otherwise(() => ({ kind: "none" }) as const);
}

// Reconciles the ?modal= search param ↔ modal store state, in BOTH directions:
//
//   • URL moved (tab switch, back/forward, deep link) → apply it to the stores
//     so the correct modal opens for the tab you landed on.
//   • Store moved (user clicked an agent / opened a modal) → write it into the
//     URL so it becomes part of the tab's persisted `currentPath`.
//
// A single effect decides the winner by comparing each side's key against the
// key it last saw. Whichever side actually changed drives; the other follows.
// After it applies, both keys match on the next render → the effect no-ops,
// which is what stops the two directions from ping-ponging.
export function ModalUrlSync() {
  const router = useRouter();
  const params = useSearchParams();

  const processesOpen    = useProcessesStore((s) => s.open);
  const setProcessesOpen = useProcessesStore((s) => s.setOpen);

  const compareOpen   = useCompareStore((s) => s.open);
  const compareRunId  = useCompareStore((s) => s.baseRunId);
  const openCompare   = useCompareStore((s) => s.openWith);
  const closeCompare  = useCompareStore((s) => s.close);

  const inspectorOpen       = useOfficeStore((s) => s.inspectorOpen);
  const selectedId          = useOfficeStore((s) => s.selectedId);
  const selectedInstanceId  = useOfficeStore((s) => s.selectedInstanceId);
  const activeTab           = useOfficeStore((s) => s.activeTab);
  const select              = useOfficeStore((s) => s.select);
  const closeInspector      = useOfficeStore((s) => s.closeInspector);
  const setActiveTab        = useOfficeStore((s) => s.setActiveTab);

  const prevUrlKey   = useRef<string | null>(null);
  const prevStoreKey = useRef<string | null>(null);

  useEffect(() => {
    const storeState: ModalState =
      processesOpen ? { kind: "processes" }
      : compareOpen && compareRunId ? { kind: "compare", runId: compareRunId }
      : inspectorOpen && selectedId
        ? {
            kind: "agent",
            agentId: selectedId,
            instanceId: selectedInstanceId,
            tab: activeTab && activeTab !== "conversation" ? activeTab : null,
          }
        : { kind: "none" };
    const urlState = modalStateFromUrl(params);
    const urlKey = modalKey(urlState);
    const storeKey = modalKey(storeState);

    if (urlKey === storeKey) {
      prevUrlKey.current = urlKey;
      prevStoreKey.current = storeKey;
      return;
    }

    // URL is the driver when it changed since we last looked (tab switch,
    // back/forward, deep link). Otherwise the store moved (a user action).
    const urlMoved = prevUrlKey.current !== null && prevUrlKey.current !== urlKey;
    const firstRun = prevUrlKey.current === null;

    if (urlMoved || firstRun) {
      applyUrlToStore(urlState, {
        processesOpen, compareOpen, inspectorOpen,
        setProcessesOpen, openCompare, closeCompare, select, closeInspector, setActiveTab,
      });
    } else {
      applyStoreToUrl(storeState, params, router);
    }

    prevUrlKey.current = urlKey;
    prevStoreKey.current = storeKey;
  }, [
    params, router,
    processesOpen, compareOpen, compareRunId, inspectorOpen,
    selectedId, selectedInstanceId, activeTab,
    setProcessesOpen, openCompare, closeCompare, select, closeInspector, setActiveTab,
  ]);

  return null;
}

// ── URL → store ─────────────────────────────────────────────────────────────
type UrlToStoreCtx = {
  processesOpen: boolean;
  compareOpen: boolean;
  inspectorOpen: boolean;
  setProcessesOpen: (v: boolean) => void;
  openCompare: (runId: string) => void;
  closeCompare: () => void;
  select: ReturnType<typeof useOfficeStore.getState>["select"];
  closeInspector: () => void;
  setActiveTab: (tab: AgentTab) => void;
};

function applyUrlToStore(next: ModalState, ctx: UrlToStoreCtx) {
  const {
    processesOpen, compareOpen, inspectorOpen,
    setProcessesOpen, openCompare, closeCompare, select, closeInspector, setActiveTab,
  } = ctx;
  match(next)
    .with({ kind: "processes" }, () => {
      if (compareOpen) closeCompare();
      if (inspectorOpen) closeInspector();
      setProcessesOpen(true);
    })
    .with({ kind: "compare" }, ({ runId }) => {
      if (processesOpen) setProcessesOpen(false);
      if (inspectorOpen) closeInspector();
      openCompare(runId);
    })
    .with({ kind: "agent" }, ({ agentId, instanceId, tab }) => {
      if (processesOpen) setProcessesOpen(false);
      if (compareOpen) closeCompare();
      select(agentId, { tab: tab ?? undefined, instanceId });
      // Set activeTab directly (not just pendingTab) so the store key matches
      // the URL immediately and the effect settles in a single pass.
      setActiveTab(tab ?? "conversation");
    })
    .with({ kind: "none" }, () => {
      if (processesOpen) setProcessesOpen(false);
      if (compareOpen) closeCompare();
      if (inspectorOpen) closeInspector();
    })
    .exhaustive();
}

// ── store → URL ─────────────────────────────────────────────────────────────
function applyStoreToUrl(
  state: ModalState,
  params: URLSearchParams,
  router: ReturnType<typeof useRouter>,
) {
  const url = new URL(window.location.href);
  const sp = url.searchParams;
  const prev = params.get("modal");

  match(state)
    .with({ kind: "processes" }, () => {
      sp.set("modal", "processes");
      clearPayload(sp);
    })
    .with({ kind: "compare" }, ({ runId }) => {
      sp.set("modal", "compare");
      sp.set("run", runId);
      clearPayload(sp, ["run"]);
    })
    .with({ kind: "agent" }, ({ agentId, instanceId, tab }) => {
      sp.set("modal", "agent");
      sp.set("agent", agentId);
      if (instanceId) sp.set("instance", instanceId);
      else sp.delete("instance");
      if (tab) sp.set("tab", tab);
      else sp.delete("tab");
      clearPayload(sp, ["agent", "instance", "tab"]);
    })
    .with({ kind: "none" }, () => {
      sp.delete("modal");
      clearPayload(sp);
    })
    .exhaustive();

  const next = url.pathname + url.search;
  const current = window.location.pathname + window.location.search;
  if (next !== current) {
    // push when opening (adds a history entry so back closes it),
    // replace when closing (don't pollute history with closed state)
    const opening = !prev && sp.has("modal");
    if (opening) router.push(next, { scroll: false });
    else router.replace(next, { scroll: false });
  }
}
