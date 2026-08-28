"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useIsMaximized } from "@/lib/use-is-maximized";

export type GnomeWindowProps = {
  children: ReactNode;
  className?: string;
};

/**
 * The app shell. There is no fixed chrome overlay (the old `<Titlebar/>` +
 * `<TabStrip/>`, 74px combined) — the project tabs / Docs / theme / account
 * chip render in normal flow at the top of `<main>` (see `main-top-bar.tsx`),
 * so no spacer row is needed here.
 *
 * Edge-to-edge in every mode: no border, no rounded corners, no shadow, no
 * chrome inset. `maximized` is preserved as a hook consumer contract but no
 * longer flips any styles.
 *
 * The two ambient radial-gradient glows are identical (same color, size, and
 * position) across every V3 mockup — they're app-shell chrome, not a
 * per-page effect. Rendered here once so they show through every route's
 * transparent sidebar/main flow containers, instead of being (re)implemented
 * — or forgotten — per page.
 */
export function GnomeWindow({ children, className }: GnomeWindowProps) {
  useIsMaximized();

  return (
    <div
      className={cn(
        "gnome-window absolute inset-0 bg-bg-0 overflow-hidden flex flex-col",
        className,
      )}
    >
      <div
        aria-hidden
        className="absolute left-[120px] top-[-220px] w-[760px] h-[560px] pointer-events-none"
        style={{ background: "radial-gradient(circle at 50% 50%, rgba(139,123,255,.16), transparent 62%)" }}
      />
      <div
        aria-hidden
        className="absolute right-[-160px] top-[180px] w-[620px] h-[520px] pointer-events-none"
        style={{ background: "radial-gradient(circle at 50% 50%, rgba(34,211,238,.09), transparent 64%)" }}
      />
      <div className="relative flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}
