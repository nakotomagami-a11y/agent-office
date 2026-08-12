"use client";

import { useEffect, useState } from "react";
import { isTauri } from "@/lib/tauri-window";

/**
 * Track whether the host Tauri window is maximized. Returns `false` in the
 * browser (which doesn't maximize a tab) and during SSR.
 *
 * Shared by the titlebar and the GnomeWindow chrome - both need to know in
 * order to swap their inset/border-radius between framed and edge-to-edge.
 */
export function useIsMaximized(): boolean {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;

    async function init() {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      setMaximized(await win.isMaximized());
      unlisten = await win.onResized(async () => {
        setMaximized(await win.isMaximized());
      });
    }

    void init();
    return () => { unlisten?.(); };
  }, []);

  return maximized;
}
