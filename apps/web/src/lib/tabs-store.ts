"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { Tab, TabsState } from "@agent-office/domain/types";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import { getUiSettings, patchUiSettings } from "@/lib/api/ui-settings";

/**
 * Client-side store for the Chrome-style project tab strip.
 *
 * ## Invariants
 * - `tabs` is unique by `projectId` for MVP (one tab per project). Opening a
 *   project that already has a tab focuses that tab instead of creating a
 *   duplicate.
 * - `activeTabId` is either null (no tabs open — landing page state) or
 *   points to a tab in `tabs`.
 * - `currentPath` on the active tab always starts with `/projects/<projectId>`
 *   so switching to that tab lands on the correct project view.
 *
 * ## Persistence
 * Serialised as JSON into `ui_settings.tabs-state`. Same best-effort pattern
 * as `active-project` — the store is functional without persistence, and
 * hydrate errors are swallowed to keep the app running when the DB is fresh.
 * The closed-tab LRU stack is persisted alongside so `Ctrl+Shift+T` still
 * works across app restarts.
 */

const STORAGE_KEY = "tabs-state";
const CLOSED_STACK_LIMIT = 10;

type StoredTabsState = TabsState & {
  closedStack: Tab[];
};

type TabsStoreState = StoredTabsState & {
  hydrated: boolean;
  /** Open a tab for the given project. Focuses an existing tab if one exists.
   *  Returns the tab id (existing or newly-created) so callers can navigate. */
  openTab: (projectId: string, initialPath?: string) => string;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  /** Called by the router-sync hook when the URL changes within the active
   *  tab. Persists the current path so tab switching restores where you were. */
  updateActiveTabPath: (path: string) => void;
  /** Replace the tab order. Ids must be a permutation of the current tab ids
   *  or the call is a no-op. */
  reorderTabs: (idsInNewOrder: string[]) => void;
  /** Pop the last-closed tab off the LRU stack, restore it, and activate it.
   *  Returns the restored tab or null if the stack was empty. */
  restoreLastClosed: () => Tab | null;
  hydrate: () => void;
};

function createTab(projectId: string, initialPath?: string): Tab {
  const now = Date.now();
  return {
    id: makeTabId(),
    projectId,
    currentPath: initialPath ?? PAGE_ROUTES.project(projectId),
    createdAt: now,
    lastActiveAt: now,
  };
}

function makeTabId(): string {
  // crypto.randomUUID is available in Node 19+ and all modern browsers where
  // this store runs (client-only). Fallback to a timestamp+random string for
  // older environments (shouldn't hit in practice).
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  return g.crypto?.randomUUID?.() ?? `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function pickNeighbor(tabs: Tab[], closingIndex: number): string | null {
  if (tabs.length === 0) return null;
  // Prefer the tab to the right; fall back to the tab to the left.
  const rightIdx = Math.min(closingIndex, tabs.length - 1);
  return tabs[rightIdx]?.id ?? tabs[tabs.length - 1]?.id ?? null;
}

type PersistShape = {
  tabs: Tab[];
  activeTabId: string | null;
  closedStack: Tab[];
};

function serialise(state: PersistShape): string {
  return JSON.stringify(state);
}

function isTabShape(t: unknown): t is Tab {
  return !!t && typeof t === "object" &&
    typeof (t as Tab).id === "string" &&
    typeof (t as Tab).projectId === "string" &&
    typeof (t as Tab).currentPath === "string";
}

function parse(raw: string | undefined): PersistShape | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object") return null;
    const { tabs, activeTabId, closedStack } = obj as Partial<PersistShape>;
    if (!Array.isArray(tabs)) return null;
    const cleanTabs = tabs.filter(isTabShape);
    const cleanClosed = Array.isArray(closedStack)
      ? closedStack.filter(isTabShape).slice(0, CLOSED_STACK_LIMIT)
      : [];
    const active = typeof activeTabId === "string" && cleanTabs.some((t) => t.id === activeTabId)
      ? activeTabId
      : (cleanTabs[0]?.id ?? null);
    return { tabs: cleanTabs, activeTabId: active, closedStack: cleanClosed };
  } catch {
    return null;
  }
}

function persist(state: PersistShape): void {
  patchUiSettings({ [STORAGE_KEY]: serialise(state) }).catch(() => {
    // Best-effort — matches the `active-project` pattern.
  });
}

function snapshot(state: TabsStoreState): PersistShape {
  return {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    closedStack: state.closedStack,
  };
}

export const useTabsStore = create<TabsStoreState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  closedStack: [],
  hydrated: false,

  openTab: (projectId, initialPath) => {
    const existing = get().tabs.find((t) => t.projectId === projectId);
    if (existing) {
      const next = {
        ...get(),
        tabs: get().tabs.map((t) =>
          t.id === existing.id ? { ...t, lastActiveAt: Date.now() } : t,
        ),
        activeTabId: existing.id,
      };
      set(next);
      persist(snapshot(next));
      return existing.id;
    }
    const tab = createTab(projectId, initialPath);
    const next = {
      ...get(),
      tabs: [...get().tabs, tab],
      activeTabId: tab.id,
    };
    set(next);
    persist(snapshot(next));
    return tab.id;
  },

  closeTab: (tabId) => {
    const state = get();
    const { tabs, activeTabId, closedStack } = state;
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const closing = tabs[idx];
    if (!closing) return;
    const remaining = tabs.filter((t) => t.id !== tabId);
    const nextActive =
      activeTabId === tabId ? pickNeighbor(remaining, idx) : activeTabId;
    // Push onto the LRU stack (drop the oldest if we're over the limit).
    const nextClosed = [closing, ...closedStack].slice(0, CLOSED_STACK_LIMIT);
    const next = {
      ...state,
      tabs: remaining,
      activeTabId: nextActive,
      closedStack: nextClosed,
    };
    set(next);
    persist(snapshot(next));
  },

  setActiveTab: (tabId) => {
    const state = get();
    const { tabs, activeTabId } = state;
    if (activeTabId === tabId) return;
    if (!tabs.some((t) => t.id === tabId)) return;
    const next = {
      ...state,
      tabs: tabs.map((t) =>
        t.id === tabId ? { ...t, lastActiveAt: Date.now() } : t,
      ),
      activeTabId: tabId,
    };
    set(next);
    persist(snapshot(next));
  },

  updateActiveTabPath: (path) => {
    const state = get();
    const { tabs, activeTabId } = state;
    if (!activeTabId) return;
    const active = tabs.find((t) => t.id === activeTabId);
    if (!active || active.currentPath === path) return;
    const next = {
      ...state,
      tabs: tabs.map((t) => (t.id === activeTabId ? { ...t, currentPath: path } : t)),
    };
    set(next);
    persist(snapshot(next));
  },

  reorderTabs: (idsInNewOrder) => {
    const state = get();
    const { tabs } = state;
    if (idsInNewOrder.length !== tabs.length) return;
    const byId = new Map(tabs.map((t) => [t.id, t]));
    const reordered: Tab[] = [];
    for (const id of idsInNewOrder) {
      const tab = byId.get(id);
      if (!tab) return; // permutation invariant broken → bail
      reordered.push(tab);
    }
    // No-op guard: same order in same positions.
    if (reordered.every((t, i) => t.id === tabs[i]?.id)) return;
    const next = { ...state, tabs: reordered };
    set(next);
    persist(snapshot(next));
  },

  restoreLastClosed: () => {
    const state = get();
    const { closedStack, tabs } = state;
    const [head, ...rest] = closedStack;
    if (!head) return null;
    // If a tab already exists for this project (opened in the meantime), just
    // focus it instead of duplicating — MVP invariant "one project = one tab".
    const existing = tabs.find((t) => t.projectId === head.projectId);
    if (existing) {
      const next = {
        ...state,
        closedStack: rest,
        activeTabId: existing.id,
      };
      set(next);
      persist(snapshot(next));
      return existing;
    }
    const restored: Tab = { ...head, lastActiveAt: Date.now() };
    const next = {
      ...state,
      tabs: [...tabs, restored],
      activeTabId: restored.id,
      closedStack: rest,
    };
    set(next);
    persist(snapshot(next));
    return restored;
  },

  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    getUiSettings()
      .then((data) => {
        const parsed = parse(data[STORAGE_KEY]);
        if (parsed) {
          set({
            tabs: parsed.tabs,
            activeTabId: parsed.activeTabId,
            closedStack: parsed.closedStack,
          });
        }
      })
      .catch(() => { /* ignore — pre-migration state */ });
  },
}));

/** Mount in the app shell (e.g. Titlebar) so the store hydrates once on boot. */
export function useTabsHydration(): void {
  const hydrate = useTabsStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
}
