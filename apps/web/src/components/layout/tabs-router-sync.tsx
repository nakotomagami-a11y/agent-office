"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import {
  useActiveProjectHydration,
  useActiveProjectStore,
} from "@/lib/active-project-store";
import { useTabsHydration, useTabsStore } from "@/lib/tabs-store";

/**
 * Wires the tabs store to Next.js's router:
 *
 *   1. Hydrates the store once on mount (reads `ui_settings.tabs-state`).
 *   2. Whenever the URL changes AND the current path lives under a project
 *      (i.e. `/projects/<id>...`), it either updates the active tab's
 *      `currentPath` (so re-activating this tab later restores the exact
 *      sub-route) or opens a brand-new tab if none exists for that project
 *      yet — matches Chrome's behaviour when a deep link is pasted.
 *
 * Non-project routes (`/agents/...`, `/settings`, `/docs`, …) don't touch the
 * tab store — they render inside whichever tab (if any) is currently active
 * without shifting its `currentPath`. That way a user viewing `/settings`
 * with project A active can flip back to A and land where they were.
 *
 * Rendered inside `<Suspense>` in `(app)/layout.tsx` because `usePathname()`
 * is a client hook that Next.js treats as a suspend-boundary source.
 */
export function TabsRouterSync() {
  useTabsHydration();
  useActiveProjectHydration();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openTab = useTabsStore((s) => s.openTab);
  const updateActiveTabPath = useTabsStore((s) => s.updateActiveTabPath);
  const setActiveProjectId = useActiveProjectStore((s) => s.setId);

  useEffect(() => {
    if (!pathname) return;
    const projectId = matchProjectPath(pathname);
    if (!projectId) {
      // Non-project routes: leave the active tab / active project as-is so
      // /settings, /docs, /agents etc render without stealing tab focus.
      return;
    }
    // Preserve query string (e.g. ?modal=agent&agent=…) so switching tabs
    // restores the exact deep-link/modal state, not just the base route.
    const query = searchParams?.toString();
    const fullPath = query ? `${pathname}?${query}` : pathname;
    // Keep the legacy active-project store aligned with the URL so existing
    // readers (sidebar, agent-details, cards-office, office-toolbar, etc.)
    // don't need a rewire during the phased tabs migration.
    setActiveProjectId(projectId);

    const state = useTabsStore.getState();
    if (!state.hydrated) return;

    const activeTab =
      state.activeTabId != null
        ? state.tabs.find((tab) => tab.id === state.activeTabId) ?? null
        : null;

    if (activeTab && activeTab.projectId === projectId) {
      // Same project as active tab → just persist the deeper sub-route so we
      // land back on it if the user switches tabs and comes back.
      updateActiveTabPath(fullPath);
      return;
    }

    const existing = state.tabs.find((tab) => tab.projectId === projectId);
    if (existing) {
      // Project already tabbed but the URL says it's now active (e.g. user
      // used browser back/forward). Focus that tab AND update its path.
      state.setActiveTab(existing.id);
      updateActiveTabPath(fullPath);
      return;
    }

    // Fresh project — open a new tab pointed at this URL.
    openTab(projectId, fullPath);
  }, [pathname, searchParams, openTab, updateActiveTabPath]);

  return null;
}

function matchProjectPath(pathname: string): string | null {
  const m = pathname.match(/^\/projects\/([^/]+)/);
  return m && m[1] ? decodeURIComponent(m[1]) : null;
}
