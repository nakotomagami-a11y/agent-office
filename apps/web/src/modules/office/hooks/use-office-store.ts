"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { getUiSettings, patchUiSettings } from "@/lib/api/ui-settings";

/**
 * Persisted server-side to `ui_settings.roster-groups`, matching the tabs and
 * theme stores. Web storage is deliberately unused here: the desktop shell
 * serves the UI from an ephemeral loopback port, and localStorage is scoped
 * per origin — so a changing port would silently reset every preference on
 * each launch.
 */
const STORAGE_KEY = "roster-groups";

/**
 * Tabs surfaced by `AgentDetailsModal`. Exported here (instead of inside the
 * modal) so other surfaces can pre-select a tab when opening the inspector -
 * e.g. clicking the edit icon on an agent card jumps straight to "prompt".
 */
export type AgentTab = "conversation" | "customization" | "context-cost";

type SelectOptions = { tab?: AgentTab; instanceId?: string | null };

type OfficeState = {
  selectedId: string | null;
  /** Roster instance under selection (one of selectedId's `AgentInstance`s). */
  selectedInstanceId: string | null;
  inspectorOpen: boolean;
  /** When set, the modal opens on this tab once and then clears it. */
  pendingTab: AgentTab | null;
  /** Currently visible tab - kept in sync by AgentDetailsModal. */
  activeTab: AgentTab;
  /**
   * Per-project set of agentIds whose roster group is expanded.
   * Keyed by projectId. Only populated when features.multiInstance is on.
   */
  expandedGroups: Record<string, string[]>;
  /**
   * Per-project set of agentIds pinned to the top of the roster.
   * Keyed by projectId, same shape as `expandedGroups`.
   */
  pinnedGroups: Record<string, string[]>;
  hydrated: boolean;
  select: (id: string | null, opts?: SelectOptions) => void;
  consumePendingTab: () => AgentTab | null;
  closeInspector: () => void;
  setActiveTab: (tab: AgentTab) => void;
  toggleGroup: (projectId: string, agentId: string) => void;
  setGroupExpanded: (projectId: string, agentId: string, expanded: boolean) => void;
  togglePin: (projectId: string, agentId: string) => void;
  hydrate: () => void;
};

/** The subset written to `ui_settings`. */
type PersistShape = Pick<OfficeState, "expandedGroups" | "pinnedGroups">;

function isGroupMap(v: unknown): v is Record<string, string[]> {
  return (
    typeof v === "object" &&
    v !== null &&
    Object.values(v).every((ids) => Array.isArray(ids) && ids.every((id) => typeof id === "string"))
  );
}

function parse(raw: string | undefined): Partial<PersistShape> | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object") return null;
    const { expandedGroups, pinnedGroups } = obj as Partial<PersistShape>;
    const out: Partial<PersistShape> = {};
    if (isGroupMap(expandedGroups)) out.expandedGroups = expandedGroups;
    if (isGroupMap(pinnedGroups)) out.pinnedGroups = pinnedGroups;
    return out;
  } catch {
    return null;
  }
}

export const useOfficeStore = create<OfficeState>((set, get) => ({
  selectedId: null,
  selectedInstanceId: null,
  inspectorOpen: false,
  pendingTab: null,
  activeTab: "conversation",
  expandedGroups: {},
  pinnedGroups: {},
  hydrated: false,
  select: (id, opts) =>
    set({
      selectedId: id,
      selectedInstanceId: id !== null ? opts?.instanceId ?? null : null,
      inspectorOpen: id !== null,
      pendingTab: id !== null ? opts?.tab ?? null : null,
    }),
  consumePendingTab: () => {
    const t = get().pendingTab;
    if (t) set({ pendingTab: null });
    return t;
  },
  closeInspector: () => set({ inspectorOpen: false, pendingTab: null, selectedInstanceId: null }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleGroup: (projectId, agentId) => {
    const current = get().expandedGroups;
    const ids = current[projectId] ?? [];
    const isExpanded = ids.includes(agentId);
    set({
      expandedGroups: {
        ...current,
        [projectId]: isExpanded ? ids.filter((id) => id !== agentId) : [...ids, agentId],
      },
    });
    persistState(get());
  },
  setGroupExpanded: (projectId, agentId, expanded) => {
    const current = get().expandedGroups;
    const ids = current[projectId] ?? [];
    const isExpanded = ids.includes(agentId);
    if (expanded === isExpanded) return;
    set({
      expandedGroups: {
        ...current,
        [projectId]: expanded ? [...ids, agentId] : ids.filter((id) => id !== agentId),
      },
    });
    persistState(get());
  },
  togglePin: (projectId, agentId) => {
    const current = get().pinnedGroups;
    const ids = current[projectId] ?? [];
    const isPinned = ids.includes(agentId);
    set({
      pinnedGroups: {
        ...current,
        [projectId]: isPinned ? ids.filter((id) => id !== agentId) : [...ids, agentId],
      },
    });
    persistState(get());
  },
  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    getUiSettings()
      .then((data) => {
        const parsed = parse(data[STORAGE_KEY]);
        if (parsed) set(parsed);
      })
      .catch(() => { /* ignore — keep defaults when the DB is fresh */ });
  },
}));

function persistState(s: OfficeState): void {
  const shape: PersistShape = {
    expandedGroups: s.expandedGroups,
    pinnedGroups: s.pinnedGroups,
  };
  patchUiSettings({ [STORAGE_KEY]: JSON.stringify(shape) }).catch(() => {
    // Best-effort — matches the `tabs-state` / `active-project` pattern.
  });
}

/** Mount in the app shell so the store hydrates once on boot. */
export function useOfficeHydration(): void {
  const hydrate = useOfficeStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
}
