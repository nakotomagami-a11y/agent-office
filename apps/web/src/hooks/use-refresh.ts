"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * In-app equivalent of the browser's Ctrl+F5 for developers.
 *
 * The app runs in Tauri (WebKitGTK) where the user has no browser reload
 * affordance, and React Query aggressively caches with `refetchOnWindowFocus:
 * false`. When the underlying data drifts (files edited on disk, a run
 * finishes without an SSE event, etc.) there's no built-in way to force a
 * fresh view. This hook provides one:
 *
 *   - `refresh()` invalidates *every* React Query cache entry, causing all
 *     active subscribers to refetch. It does NOT reload the page — component
 *     state (open modals, unsaved drafts, in-flight compositions) is
 *     preserved.
 *   - The hook installs a global Ctrl/Cmd+R capture listener that hijacks the
 *     browser's native reload while the app is focused. In Tauri this
 *     replaces the default WebKitGTK behaviour of dumping the entire session.
 *   - `refreshing` briefly flips to `true` after each refresh so the caller
 *     can render a "just happened" acknowledgement (e.g. a spinning icon or
 *     a subtle toast).
 */
export function useRefresh(): {
  refresh: () => void;
  refreshing: boolean;
} {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries();
    setRefreshing(true);
    // Match the ~400ms icon spin so the visual acknowledgement isn't
    // shorter than the network flight for the invalidated queries.
    window.setTimeout(() => setRefreshing(false), 700);
  }, [queryClient]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isReloadKey =
        event.key === "r" || event.key === "R" || event.key === "F5";
      if (!isReloadKey) return;
      if (event.key === "F5") {
        event.preventDefault();
        refresh();
        return;
      }
      // For "r" / "R" we only care about the reload combo (Ctrl+R / Cmd+R),
      // not plain typing.
      const wantsReload = event.ctrlKey || event.metaKey;
      if (!wantsReload) return;
      // Ctrl+Shift+R is the browser's hard reload; leave it alone so a
      // developer with a genuinely-stuck app can still escape.
      if (event.shiftKey) return;
      event.preventDefault();
      refresh();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [refresh]);

  return { refresh, refreshing };
}
