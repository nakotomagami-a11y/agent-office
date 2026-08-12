"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

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
};

export const useOfficeStore = create<OfficeState>()(persist((set, get) => ({
  view: "iso",
  isoEnabled: true,
  selectedId: null,
  selectedInstanceId: null,
  inspectorOpen: false,
  pendingTab: null,
  activeTab: "conversation",
  expandedGroups: {},
  pinnedGroups: {},
  navHeight: null,
  setNavHeight: (px) => set({ navHeight: px }),
  setView: (next) => set({ view: next }),
  setIsoEnabled: (next) => set({ isoEnabled: next }),
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
  },
}), {
  name: "office-view",
  partialize: (s) => ({ view: s.view, isoEnabled: s.isoEnabled, expandedGroups: s.expandedGroups, pinnedGroups: s.pinnedGroups, navHeight: s.navHeight }),
}));
