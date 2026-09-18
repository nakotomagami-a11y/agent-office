"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { MotionConfig } from "framer-motion";
import { useState } from "react";
import { AppEvents } from "./app-events";
import { PowerSync } from "./power-sync";
import { usePerformanceStore } from "@/lib/performance-store";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  // Framer-motion is JS-driven, so the CSS `animation:none` rules in
  // performance.css never reach it. Gate it on the performance tier here:
  //   • Efficiency ("off") → "always": every motion.*/AnimatePresence collapses
  //     to instant. This is what makes "everything stops" actually stop.
  //   • High / Balanced   → "user": respect the OS prefers-reduced-motion only,
  //     so panel/route transitions stay in both (Balanced is the generous middle).
  const efficiency = usePerformanceStore((s) => s.mode === "off");

  return (
    <QueryClientProvider client={queryClient}>
      {/* One app-wide SSE listener → React Query invalidations (replaces most
          refetchInterval polling for server-driven state). Renders nothing. */}
      <AppEvents />
      {/* Auto performance-mode switching from the AC/battery power source.
          Renders nothing. See performance-store.ts's `applyPowerState`. */}
      <PowerSync />
      <MotionConfig reducedMotion={efficiency ? "always" : "user"}>{children}</MotionConfig>
      {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
