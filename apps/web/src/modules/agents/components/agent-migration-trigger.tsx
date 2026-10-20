"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/fetch";
import { queryKeys } from "@/lib/api/query-keys";
import { API_ROUTES } from "@agent-office/api-contract";
import type { AppSettings } from "@agent-office/domain/types";
import { AgentMigrationModal } from "./agent-migration-modal";
import { useAgentDiff, useApplyAgentDiff } from "../hooks/use-agent-migration";

/**
 * Mount-once component that decides whether to show the migration modal
 * on app launch.
 *
 * The trigger is deliberately quiet — it only opens the modal when:
 *   1. First-run wizard has already completed (`firstRunComplete === true`
 *      — otherwise the wizard handles initial imports and a second modal
 *      would double-prompt).
 *   2. The bundled MANIFEST version is newer than the installed version
 *      (an older build must never offer its agents over a newer roster).
 *   3. There is at least one actionable diff entry (new + changed) the user
 *      hasn't already skipped for this version or declined before.
 *
 * Silent path renders nothing. Wire once from the app-shell layout so a
 * single app session shows at most one modal across route transitions.
 */
export function AgentMigrationTrigger() {
  const settingsQ = useQuery({
    queryKey: queryKeys.settings.detail(),
    queryFn: () => apiFetch<AppSettings | null>(API_ROUTES.settings),
    staleTime: 60_000,
  });
  const firstRunDone = !!settingsQ.data?.firstRunComplete;

  const diffQ = useAgentDiff(firstRunDone);
  const applyM = useApplyAgentDiff();
  const [open, setOpen] = useState(false);
  const [handled, setHandled] = useState(false);

  useEffect(() => {
    if (handled) return;
    if (!firstRunDone) return;
    if (!diffQ.data) return;
    const { bundleVersion, installedVersion, bundleOlder, newAgents, changed, skipped } = diffQ.data;
    // No manifest on disk (dev clone without starter-data) → nothing to migrate.
    if (!bundleVersion) {
      setHandled(true);
      return;
    }
    // Already processed this exact bundle version, or this build ships an older one → nothing to offer.
    if (installedVersion === bundleVersion || bundleOlder) {
      setHandled(true);
      return;
    }
    // Nothing actionable → stamp the version (fire and forget: a failure only repeats this no-op).
    if (newAgents.length === 0 && changed.length === 0) {
      applyM.mutate({ accept: [], skip: [], markComplete: true });
      setHandled(true);
      return;
    }
    // Skipped ("Remind me later") and declined agents don't re-open it; Settings still lists them.
    const skippedSet = new Set(skipped);
    const pending = [...newAgents.filter((a) => !a.declined), ...changed].some((a) => !skippedSet.has(a.id));
    if (pending) setOpen(true);
    setHandled(true);
  }, [firstRunDone, diffQ.data, handled, applyM]);

  return <AgentMigrationModal open={open} onClose={() => setOpen(false)} />;
}
