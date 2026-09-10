"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * In-app equivalent of the browser's reload button, for a shell (Tauri /
 * WebKitGTK) that has none.
 *
 * `frontendDist`/`devUrl` in `tauri.conf.json` point at a URL served by a
 * separate Next.js process (the "backend") — the webview is just a client of
 * it, same as a browser tab is a client of any web server. So a real
 * `location.reload()` behaves exactly like hitting refresh in a browser: the
 * frontend (JS bundle, React tree, every store/cache) comes back fresh, while
 * the backend process keeps running untouched.
 *
 * An earlier version of this hook tried to approximate a refresh by calling
 * `queryClient.invalidateQueries()` instead of actually reloading, to
 * "preserve state". In practice that only ever refetched React Query's own
 * cache — it left stale Zustand stores, stuck modals, and any other local
 * component state exactly as broken as they were, which is why "Refresh"
 * looked like it did nothing. A real reload fixes all of that generically,
 * with no per-store/per-cache hardcoding to maintain.
 */
export function useRefresh(): {
  refresh: () => void;
  refreshing: boolean;
} {
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => {
    setRefreshing(true);
    window.location.reload();
  }, []);

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
