"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { AppSettings } from "@agent-office/domain/types";
import { FirstRunWizard } from "./first-run-wizard";

/**
 * Single-source-of-truth gate for the first-run wizard. Sits in the
 * app-shell layout, reads /api/settings, and mounts the wizard
 * whenever the saved settings either don't exist or haven't been
 * marked complete. Once the wizard finishes (or the user reloads
 * after a successful PUT /api/settings) this component renders
 * nothing.
 */
export function FirstRunGate() {
  const q = useQuery({
    queryKey: queryKeys.settings.detail(),
    queryFn: () => apiFetch<AppSettings | null>(API_ROUTES.settings),
    // Stale while the user is in the wizard; refetch after they finish.
    staleTime: 0,
  });

  if (q.isLoading) return null;
  if (q.data && q.data.firstRunComplete) return null;

  return <FirstRunWizard onDone={() => q.refetch()} />;
}
