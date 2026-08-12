"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Resets `window.scrollTo(0, 0)` on every route change. Mounted once near the
 * root so navigating between scrolled-down pages always lands at the top.
 */
export function ScrollReset() {
  const pathname = usePathname();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
