import { useEffect } from "react";
import { create } from "zustand";
import { getUiSettings, patchUiSettings } from "@/lib/api/ui-settings";

export type Theme = "light" | "dark";

const DOC_ATTR = "data-theme";

type ThemeState = {
  theme: Theme;
  hydrated: boolean;
  setTheme: (next: Theme) => void;
  toggle: () => void;
  hydrate: () => void;
};

function writeDom(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(DOC_ATTR, theme);
}

function systemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: "light",
  hydrated: false,
  setTheme: (next) => {
    writeDom(next);
    set({ theme: next });
    patchUiSettings({ theme: next }).catch(() => { /* best-effort */ });
  },
  toggle: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    get().setTheme(next);
  },
  hydrate: () => {
    if (get().hydrated) return;
    // Set hydrated immediately to prevent double-calls, apply system default first
    const fallback = systemTheme();
    writeDom(fallback);
    set({ theme: fallback, hydrated: true });
    // Then fetch the stored preference
    getUiSettings()
      .then((data) => {
        const stored = data["theme"];
        if (stored === "dark" || stored === "light") {
          writeDom(stored);
          set({ theme: stored });
        }
      })
      .catch(() => { /* ignore */ });
  },
}));

/**
 * Mount-time hook. Call once near the root so the store reads the persisted
 * value and aligns the DOM attribute. Skips work after the first hydration
 * to avoid render loops.
 */
export function useThemeHydration() {
  const hydrate = useThemeStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
}
