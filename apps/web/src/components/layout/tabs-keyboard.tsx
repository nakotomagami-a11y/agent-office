"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import { useTabsStore } from "@/lib/tabs-store";

/**
 * Global Chrome-style keyboard shortcuts for the tab strip:
 *
 *   - Ctrl/Cmd + W         → close the currently active tab
 *   - Ctrl/Cmd + Tab       → activate the next tab (wrap-around)
 *   - Ctrl/Cmd + Shift+Tab → activate the previous tab
 *   - Ctrl/Cmd + 1..8      → activate tab N (1-indexed)
 *   - Ctrl/Cmd + 9         → activate the LAST tab (Chrome convention)
 *   - Ctrl/Cmd + Shift+T   → restore the most-recently-closed tab
 *
 * Ignores keystrokes originating in text inputs / textareas / contenteditable
 * so you don't lose composed text mid-typing. Best-effort context-menu skip.
 *
 * Mounted once at layout level via `<TabsKeyboard />`.
 */
export function TabsKeyboard() {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (isInEditableTarget(e.target)) return;

      const key = e.key.toLowerCase();
      const state = useTabsStore.getState();

      if (key === "w") {
        const activeId = state.activeTabId;
        if (!activeId) return;
        e.preventDefault();
        state.closeTab(activeId);
        const nextActiveId = useTabsStore.getState().activeTabId;
        const nextTab = nextActiveId
          ? useTabsStore.getState().tabs.find((t) => t.id === nextActiveId)
          : null;
        router.push(nextTab?.currentPath ?? PAGE_ROUTES.projects);
        return;
      }

      if (key === "tab") {
        if (state.tabs.length < 2) return;
        e.preventDefault();
        const idx = state.tabs.findIndex((t) => t.id === state.activeTabId);
        const delta = e.shiftKey ? -1 : 1;
        const nextIdx =
          idx === -1
            ? 0
            : (idx + delta + state.tabs.length) % state.tabs.length;
        const nextTab = state.tabs[nextIdx];
        if (!nextTab) return;
        state.setActiveTab(nextTab.id);
        router.push(nextTab.currentPath);
        return;
      }

      // Ctrl+Shift+T — restore most-recently-closed tab.
      if (e.shiftKey && key === "t") {
        e.preventDefault();
        const restored = state.restoreLastClosed();
        if (restored) router.push(restored.currentPath);
        return;
      }

      // Ctrl+1..8 → tab N (1-indexed). Ctrl+9 → LAST tab, Chrome-style.
      if (!e.shiftKey && /^[1-9]$/.test(e.key)) {
        if (state.tabs.length === 0) return;
        e.preventDefault();
        let idx: number;
        if (e.key === "9") {
          idx = state.tabs.length - 1;
        } else {
          idx = Math.min(Number(e.key) - 1, state.tabs.length - 1);
        }
        const target = state.tabs[idx];
        if (!target) return;
        state.setActiveTab(target.id);
        router.push(target.currentPath);
        return;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return null;
}

function isInEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}
