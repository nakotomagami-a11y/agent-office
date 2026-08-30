"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { assertNever } from "@/lib/assert-never";
import { useProcessesStore } from "@/lib/processes-store";
import { useCompareStore } from "@/lib/compare-store";
import { useOfficeStore, type AgentTab } from "@/modules/office/hooks/use-office-store";

const AGENT_TABS: AgentTab[] = ["conversation", "customization"];
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
  switch (s.kind) {
    case "processes": return "processes";
    case "compare": return `compare:${s.runId}`;
    case "agent": return `agent:${s.agentId}:${s.instanceId ?? ""}:${s.tab ?? "conversation"}`;
    case "none": return "none";
    default: return assertNever(s);
  }
}

function modalStateFromUrl(sp: URLSearchParams): ModalState {
  const modal = sp.get("modal");
  if (modal === "processes") return { kind: "processes" };
  if (modal === "compare") {
    const runId = sp.get("run");
    return runId ? { kind: "compare", runId } : { kind: "none" };
  }
  if (modal === "agent") {
    const agentId = sp.get("agent");
    if (!agentId) return { kind: "none" };
    const tab = sp.get("tab");
    return {
      kind: "agent",
      agentId,
      instanceId: sp.get("instance"),
      tab: isAgentTab(tab) ? tab : null,
    };
  }
  return { kind: "none" };
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
  switch (next.kind) {
    case "processes":
      if (compareOpen) closeCompare();
      if (inspectorOpen) closeInspector();
      setProcessesOpen(true);
      return;
    case "compare":
      if (processesOpen) setProcessesOpen(false);
      if (inspectorOpen) closeInspector();
      openCompare(next.runId);
      return;
    case "agent":
      if (processesOpen) setProcessesOpen(false);
      if (compareOpen) closeCompare();
      select(next.agentId, { tab: next.tab ?? undefined, instanceId: next.instanceId });
      // Set activeTab directly (not just pendingTab) so the store key matches
      // the URL immediately and the effect settles in a single pass.
      setActiveTab(next.tab ?? "conversation");
      return;
    case "none":
      if (processesOpen) setProcessesOpen(false);
      if (compareOpen) closeCompare();
      if (inspectorOpen) closeInspector();
      return;
    default:
      assertNever(next);
  }
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

  switch (state.kind) {
    case "processes":
      sp.set("modal", "processes");
      clearPayload(sp);
      break;
    case "compare":
      sp.set("modal", "compare");
      sp.set("run", state.runId);
      clearPayload(sp, ["run"]);
      break;
    case "agent":
      sp.set("modal", "agent");
      sp.set("agent", state.agentId);
      if (state.instanceId) sp.set("instance", state.instanceId);
      else sp.delete("instance");
      if (state.tab) sp.set("tab", state.tab);
      else sp.delete("tab");
      clearPayload(sp, ["agent", "instance", "tab"]);
      break;
    case "none":
      sp.delete("modal");
      clearPayload(sp);
      break;
    default:
      assertNever(state);
  }

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
