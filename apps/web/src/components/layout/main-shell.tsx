import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Sidebar } from "./sidebar";
import { ScrollReset } from "./scroll-reset";
import { PageTransition } from "./page-transition";

export type MainShellProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Body of the GNOME window: sidebar on the left + main column on the right.
 * Owns the per-route scroll reset + fade transition so individual pages don't
 * have to.
 */
export function MainShell({ children, className }: MainShellProps) {
  return (
    // Explicit viewport-relative height — the app chrome is 38 px titlebar +
    // 36 px tab strip = 74 px fixed at the top. Inline `style` instead of a
    // Tailwind `h-[calc(...)]` arbitrary value because the dev server's JIT
    // sometimes fails to regenerate the class mid-session, which collapses
    // the layout. Inline style is bulletproof.
    <div
      className={cn("flex min-h-0 flex-nowrap", className)}
      style={{ height: "calc(100vh - 74px)" }}
    >
      <div className="shrink-0 w-[248px] max-[1024px]:w-[64px] max-[600px]:hidden h-full">
        <Sidebar />
      </div>
      <main className="flex-1 min-w-0 flex flex-col min-h-0 h-full">
        <ScrollReset />
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
