"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Cross-fade route content. CSS keyed on the pathname - the browser handles
 * the animation, so no extra render pass per navigation.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div
      key={pathname}
      className="animate-[page-fade-in_160ms_ease-out] flex-1 min-h-0 flex flex-col"
    >
      {children}
    </div>
  );
}
