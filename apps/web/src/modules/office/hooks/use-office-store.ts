"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { getUiSettings, patchUiSettings } from "@/lib/api/ui-settings";

/**
 * Persisted server-side to `ui_settings.office-view`, matching the tabs and
 * theme stores. Web storage is deliberately unused here: the desktop shell
 * serves the UI from an ephemeral loopback port, and localStorage is scoped
 * per origin — so a changing port would silently reset every preference on
 * each launch.
 */
const STORAGE_KEY = "office-view";

export type OfficeView = "iso" | "cards";

/**
 * Tabs surfaced by `AgentDetailsModal`. Exported here (instead of inside the
 * modal) so other surfaces can pre-select a tab when opening the inspector -
 * e.g. clicking the edit icon on an agent card jumps straight to "prompt".
 */
export type AgentTab = "conversation" | "history" | "memory" | "settings";

type SelectOptions = { tab?: AgentTab; instanceId?: string | null };

type OfficeState = {
  view: OfficeView;
  /**
   * Master capability gate for the isometric renderer (dev-menu toggle). When
   * false the iso floor is never loaded, the in-app iso/cards switch is hidden,
   * and only the flat card grid is reachable. `view` is still remembered so
   * re-enabling restores the user's last iso/cards choice.
   */
  isoEnabled: boolean;
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
  /**
   * Height (px) the sidebar's nav/links block is pinned to, set by dragging the
   * divider between the links and roster blocks. `null` = natural content height
   * (roster takes all remaining space). Persisted.
   */
  navHeight: number | null;
  hydrated: boolean;
  setNavHeight: (px: number | null) => void;
  setView: (next: OfficeView) => void;
  setIsoEnabled: (next: boolean) => void;
  select: (id: string | null, opts?: SelectOptions) => void;
  consumePendingTab: () => AgentTab | null;
  closeInspector: () => void;
  setActiveTab: (tab: AgentTab) => void;
  toggleGroup: (projectId: string, agentId: string) => void;
  setGroupExpanded: (projectId: string, agentId: string, expanded: boolean) => void;
  togglePin: (projectId: string, agentId: string) => void;
  hydrate: () => void;
};

/** The subset written to `ui_settings` — mirrors the old persist partialize. */
type PersistShape = Pick<
  OfficeState,
  "view" | "isoEnabled" | "expandedGroups" | "pinnedGroups" | "navHeight"
>;

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
    const { view, isoEnabled, expandedGroups, pinnedGroups, navHeight } = obj as Partial<PersistShape>;
    const out: Partial<PersistShape> = {};
    if (view === "iso" || view === "cards") out.view = view;
    if (typeof isoEnabled === "boolean") out.isoEnabled = isoEnabled;
    if (isGroupMap(expandedGroups)) out.expandedGroups = expandedGroups;
    if (isGroupMap(pinnedGroups)) out.pinnedGroups = pinnedGroups;
    if (navHeight === null || typeof navHeight === "number") out.navHeight = navHeight;
    return out;
  } catch {
    return null;
  }
}

export const useOfficeStore = create<OfficeState>((set, get) => ({
  // Cards is the default surface, and the iso renderer ships opt-in: a fresh
  // install lands on the flat grid with the dev-menu gate off. Both are
  // persisted, so these defaults only ever apply before the user chooses.
  view: "cards",
  isoEnabled: false,
  selectedId: null,
  selectedInstanceId: null,
  inspectorOpen: false,
  pendingTab: null,
  activeTab: "conversation",
  expandedGroups: {},
  pinnedGroups: {},
  navHeight: null,
  hydrated: false,
  setNavHeight: (px) => {
    set({ navHeight: px });
    persistState(get());
  },
  setView: (next) => {
    set({ view: next });
    persistState(get());
  },
  setIsoEnabled: (next) => {
    set({ isoEnabled: next });
    persistState(get());
  },
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
    view: s.view,
    isoEnabled: s.isoEnabled,
    expandedGroups: s.expandedGroups,
    pinnedGroups: s.pinnedGroups,
    navHeight: s.navHeight,
  };
  patchUiSettings({ [STORAGE_KEY]: JSON.stringify(shape) }).catch(() => {
    // Best-effort — matches the `tabs-state` / `active-project` pattern.
  });
}

/** Mount in the app shell (e.g. Titlebar) so the store hydrates once on boot. */
export function useOfficeHydration(): void {
  const hydrate = useOfficeStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
}
