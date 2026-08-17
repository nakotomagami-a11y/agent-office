"use client";

import { useMemo } from "react";
import { useRegistry, useInstalledSkills } from "./use-skills";
import type { InstalledSkill, RegistrySkill } from "@agent-office/domain/types";

/**
 * The registry (`useRegistry`) only knows the GitHub catalog, so its `installed`
 * flag is true only for catalog skills that happen to exist on disk. But most
 * real installed skills live in `~/.claude/agents/_skills/` and never appear in
 * the catalog — which is why the raw registry reports "0 installed" even when
 * the machine has 100+ skills.
 *
 * This hook merges the truthful installed set (`useInstalledSkills`) with the
 * catalog into one list the UI can trust: every on-disk skill shows as
 * installed, provenance is preserved so `skillOrigin` still separates GitHub
 * originals from local ones, and catalog entries the user hasn't installed
 * remain browsable.
 */
function installedToRegistry(s: InstalledSkill): RegistrySkill {
  return {
    // Preserve the GitHub provenance when present so origin classification still
    // works; hand-authored skills (no provenance) fall back to "local".
    source: s.provenance?.source ?? "local",
    ref: s.provenance?.ref ?? "local",
    name: s.name,
    description: s.description,
    path: s.provenance?.path ?? s.name,
    sha: s.provenance?.sha ?? "",
    tags: [],
    installed: true,
    size: s.body ? s.body.length : undefined,
  };
}

export interface SkillListResult {
  skills: RegistrySkill[];
  installedCount: number;
  catalogCount: number;
  registryQ: ReturnType<typeof useRegistry>;
  installedQ: ReturnType<typeof useInstalledSkills>;
  isLoading: boolean;
  isError: boolean;
}

export function useSkillList(): SkillListResult {
  const registryQ = useRegistry();
  const installedQ = useInstalledSkills();

  const skills = useMemo(() => {
    const catalog = registryQ.data ?? [];
    const installed = installedQ.data ?? [];
    const installedNames = new Set(installed.map((s) => s.name));

    const local = installed.map(installedToRegistry);
    // Drop catalog entries shadowed by an installed skill of the same name so a
    // skill never appears twice; the installed copy (with real body size) wins.
    const catalogOnly = catalog.filter((r) => !installedNames.has(r.name));

    return [...local, ...catalogOnly].sort((a, b) => a.name.localeCompare(b.name));
  }, [registryQ.data, installedQ.data]);

  const installedCount = useMemo(() => skills.filter((s) => s.installed).length, [skills]);
  const catalogCount = registryQ.data?.length ?? 0;

  return {
    skills,
    installedCount,
    catalogCount,
    registryQ,
    installedQ,
    isLoading: registryQ.isLoading || installedQ.isLoading,
    isError: registryQ.isError,
  };
}
