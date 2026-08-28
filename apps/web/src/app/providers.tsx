"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { MotionConfig } from "framer-motion";
import { useState } from "react";

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

  return (
    <QueryClientProvider client={queryClient}>
      {/* `reducedMotion="user"` makes every `motion.*`/`AnimatePresence` in the
          tree respect the OS-level prefers-reduced-motion setting automatically
          (collapsing transforms/opacity transitions to instant) — CSS's own
          prefers-reduced-motion rule (performance.css) doesn't reach these
          JS-driven animations at all, so this was a real gap. See Phase 10.4. */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
      {process.env.NODE_ENV === "development" && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
