"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Sidebar } from "./sidebar";
import { MainTopBar } from "./main-top-bar";
import { ScrollReset } from "./scroll-reset";
import { PageTransition } from "./page-transition";
import { useThemeHydration } from "@/lib/theme-store";
import { usePerformanceHydration } from "@/lib/performance-store";
import { useOfficeHydration } from "@/modules/office/hooks/use-office-store";

export type MainShellProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Body of the GNOME window: roster sidebar on the left + main column on the
 * right. `<MainTopBar/>` (project tabs, Docs, theme, account/nav chip) is
 * mounted here — once — so every page gets it for free instead of each
 * route re-rendering its own copy.
 *
 * No fixed-chrome height reservation anymore — the old Titlebar (38px) +
 * TabStrip (36px) fixed overlay is gone, so `<main>` fills the full window
 * height and owns its own top bar in normal flow.
 *
 * Also owns the three app-level hydration hooks that used to live on the
 * now-removed `<Titlebar/>` (theme, performance mode, office store) — this
 * is the new single mount point at the same architectural tier.
 */
export function MainShell({ children, className }: MainShellProps) {
  useThemeHydration();
  usePerformanceHydration();
  useOfficeHydration();

  return (
    <div className={cn("flex min-h-0 flex-nowrap h-full", className)}>
      <div className="shrink-0 w-[252px] max-[1024px]:w-[64px] max-[600px]:hidden h-full">
        <Sidebar />
      </div>
      <main className="flex-1 min-w-0 flex flex-col min-h-0 h-full">
        <MainTopBar />
        <div className="flex-1 min-h-0 flex flex-col">
          <ScrollReset />
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
    </div>
  );
}
