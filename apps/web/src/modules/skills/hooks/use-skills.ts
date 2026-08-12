"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { InstalledSkill, RegistrySkill} from "@agent-office/domain/types";

export interface SkillManifestEntry {
  slug: string;
  source_id?: string;
  source_path?: string;
  symlink_status?: string;
  target?: string;
  category?: string;
  workflow_depth?: string;
  token_cost_est?: number;
  impact_tier?: string;
  impact_emoji?: string;
  description?: string;
}

export interface SkillManifest {
  generated_at?: string;
  generator?: string;
  cost_indicator_scale?: Record<string, string>;
  workflow_depth_legend?: Record<string, string>;
  sources?: Record<string, unknown>;
  skills: SkillManifestEntry[];
}

export interface SkillCompatibility {
  conflicts?: unknown;
  synergies?: unknown;
  ab_test_pairs?: unknown;
  [k: string]: unknown;
}

export function useRegistry(refresh = false) {
  return useQuery({
    queryKey: queryKeys.skills.registry(),
    queryFn: () =>
      apiFetch<RegistrySkill[]>(`${API_ROUTES.skillsRegistry}${refresh ? "?refresh=1" : ""}`),
    staleTime: 60 * 60_000,
  });
}

export function useInstalledSkills() {
  return useQuery({
    queryKey: queryKeys.skills.installed(),
    queryFn: () => apiFetch<InstalledSkill[]>(API_ROUTES.skillsInstalled),
  });
}


export interface InstallSkillInput {
  source: string;
  ref: string;
  path: string;
  name: string;
}

export function useInstallSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InstallSkillInput) =>
      apiFetch<{ ok: boolean }>(API_ROUTES.skillsInstall, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.skills.all });
    },
  });
}

export function useSkillManifest() {
  return useQuery({
    queryKey: queryKeys.skills.manifest(),
    queryFn: () => apiFetch<SkillManifest>(API_ROUTES.skillsManifest),
    staleTime: 60 * 60_000,
  });
}

export function useSkillCompatibility() {
  return useQuery({
    queryKey: queryKeys.skills.compatibility(),
    queryFn: () => apiFetch<SkillCompatibility>(API_ROUTES.skillsCompatibility),
    staleTime: 60 * 60_000,
  });
}

// ── Generated weapon icons ────────────────────────────────────────────────

import type { IconConfig } from "@agent-office/pixel-icons";

export type SkillIconMap = Record<string, IconConfig>;

/** Stable key + default (derived) icon config for a skill. */
export function skillIconKey(skill: Pick<RegistrySkill, "source" | "name">): string {
  return `${skill.source}/${skill.name}`;
}

/** Persisted override if present, else a deterministic icon derived from the key. */
export function skillIconConfig(map: SkillIconMap | undefined, key: string): IconConfig {
  return map?.[key] ?? { seed: key, iconClass: "any" };
}

export function useSkillIcons() {
  return useQuery({
    queryKey: queryKeys.skills.icons(),
    queryFn: () => apiFetch<SkillIconMap>(API_ROUTES.skillsIcons),
    staleTime: 60 * 60_000,
  });
}

export function useRerollSkillIcon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      apiFetch<{ ok: boolean; key: string; config: IconConfig }>(API_ROUTES.skillsIcons, {
        method: "POST",
        body: { key },
      }),
    onSuccess: (res) => {
      qc.setQueryData<SkillIconMap>(queryKeys.skills.icons(), (prev) => ({
        ...(prev ?? {}),
        [res.key]: res.config,
      }));
    },
  });
}

/** Persist an explicit icon config (chosen seed + weapon type) for a skill. */
export function useSetSkillIcon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, config }: { key: string; config: IconConfig }) =>
      apiFetch<{ ok: boolean; key: string; config: IconConfig }>(API_ROUTES.skillsIcons, {
        method: "POST",
        body: { key, seed: config.seed, iconClass: config.iconClass },
      }),
    onSuccess: (res) => {
      qc.setQueryData<SkillIconMap>(queryKeys.skills.icons(), (prev) => ({
        ...(prev ?? {}),
        [res.key]: res.config,
      }));
    },
  });
}

export function useUninstallSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ removed: boolean }>(API_ROUTES.skill(name), { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.skills.all });
    },
  });
}

// ── Sources (user-added GitHub repos) ─────────────────────────────────────

export type SourceRow = { source: string; ref: string; builtIn: boolean };

export function useSkillSources() {
  return useQuery({
    queryKey: queryKeys.skills.sources(),
    queryFn: () => apiFetch<SourceRow[]>(API_ROUTES.skillsSources),
    staleTime: 5 * 60_000,
  });
}

export function useAddSkillSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: string) =>
      apiFetch<{ ok: boolean; source: { source: string; ref: string } }>(
        API_ROUTES.skillsSources,
        { method: "POST", body: { input } },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.skills.all });
    },
  });
}

export function useRemoveSkillSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { source: string; ref: string }) =>
      apiFetch<{ removed: boolean }>(
        `${API_ROUTES.skillsSources}?source=${encodeURIComponent(input.source)}&ref=${encodeURIComponent(input.ref)}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.skills.all });
    },
  });
}

// ── Updates (SHA drift check) ─────────────────────────────────────────────

export type SkillUpdate = {
  name: string;
  currentSha: string;
  latestSha: string;
  source: string;
  path: string;
};

/**
 * Polls the updates endpoint on app boot + every hour. The updates bell
 * in the titlebar reads this — count drives the badge, list drives the
 * dropdown.
 */
export function useSkillUpdates() {
  return useQuery({
    queryKey: queryKeys.skills.updates(),
    queryFn: () => apiFetch<SkillUpdate[]>(API_ROUTES.skillsUpdates),
    staleTime: 60 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ filesWritten: number; sha: string }>(
        API_ROUTES.skillUpdate(name),
        { method: "POST" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.skills.all });
    },
  });
}
