"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";

/**
 * Client for the agent-migration diff endpoint (`/api/starter/agent-diff`).
 *
 * The GET query drives the migration modal's three-list UI. The mutation
 * applies the founder's accept/skip choices in one shot, then invalidates
 * the agent list so the newly-installed / overridden agents show up
 * without a manual refresh.
 */

export interface AgentDiffEntry {
  id: string;
  name: string;
  description: string;
  bundleHash?: string;
  installedHash?: string;
}

export interface AgentDiffResponse {
  /** Bundled starter-data MANIFEST.json version. */
  bundleVersion: string | null;
  /** The version this workspace last ran a migration against, or null on
      first launch. Modal triggers when installed !== bundle. */
  installedVersion: string | null;
  /** Bundled but not installed — clean adds. */
  newAgents: AgentDiffEntry[];
  /** Installed AND bundled — hashes differ. Candidates for override. */
  changed: AgentDiffEntry[];
  /** Installed but not bundled. Never touched by accept; surfaced so the
      user knows their custom / older agents will stay put. */
  onlyLocal: AgentDiffEntry[];
  /** Slugs the user skipped in a previous run of THIS SAME bundle version.
      Modal pre-checks skip on those rows so a re-open won't re-nag. */
  skipped: string[];
}

export interface AgentDiffApplyRequest {
  accept: string[];
  skip: string[];
  /** Send `false` if the user closes the modal without committing so we
      don't record this bundle version as fully processed. */
  markComplete?: boolean;
}

export interface AgentDiffApplyResponse {
  /** Slugs where the bundled file was copied into ~/.claude/agents/. */
  applied: string[];
  /** Slugs whose previous local file was moved into `_archive/` before override. */
  backedUp: string[];
  /** Echo of the `skip` slugs, now persisted for the current version. */
  skipped: string[];
  /** Per-slug failures. Empty on the happy path. */
  errors: { id: string; reason: string }[];
  /** The bundle version this run committed against. */
  bundleVersion: string;
}

/** Diff query. Runs on demand — the trigger component polls this once on
    mount and re-queries after every apply. Not enabled by default so pages
    that don't care don't pay the cost. */
export function useAgentDiff(enabled = true) {
  return useQuery({
    queryKey: queryKeys.agents.migrationDiff(),
    queryFn: () => apiFetch<AgentDiffResponse>("/api/starter/agent-diff"),
    enabled,
    // Migration diff is manifest-driven and doesn't shift under our feet
    // outside of an explicit user action. Long stale time avoids refetch
    // storms during the modal session.
    staleTime: 60_000,
  });
}

/** Apply mutation. Invalidates both the migration diff (so the modal can
    hide once resolved) and the agent list (so freshly-imported agents
    appear in the sidebar). */
export function useApplyAgentDiff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AgentDiffApplyRequest) =>
      apiFetch<AgentDiffApplyResponse>("/api/starter/agent-diff", {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.agents.migrationDiff() });
      qc.invalidateQueries({ queryKey: queryKeys.agents.all });
    },
  });
}
