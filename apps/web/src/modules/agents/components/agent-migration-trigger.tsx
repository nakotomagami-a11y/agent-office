"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
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
 *   2. The bundled MANIFEST version differs from the installed version.
 *   3. There is at least one actionable diff entry (new + changed).
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
    const { bundleVersion, installedVersion, newAgents, changed } = diffQ.data;
    // No manifest on disk (dev clone without starter-data present) →
    // nothing to migrate.
    if (!bundleVersion) {
      setHandled(true);
      return;
    }
    // User already processed this exact bundle version → don't re-nag.
    if (installedVersion === bundleVersion) {
      setHandled(true);
      return;
    }
    // Version changed but zero actionable entries → stamp the marker so
    // the trigger doesn't re-run this exact diff on every reload. Fire
    // and forget — errors are silently swallowed because the worst case
    // is one extra reload issuing the same no-op.
    if (newAgents.length === 0 && changed.length === 0) {
      applyM.mutate({ accept: [], skip: [], markComplete: true });
      setHandled(true);
      return;
    }
    setOpen(true);
    setHandled(true);
  }, [firstRunDone, diffQ.data, handled, applyM]);

  return <AgentMigrationModal open={open} onClose={() => setOpen(false)} />;
}
