import type { RegistrySkill } from "@agent-office/domain/types";

export type RegistrySort = "name" | "installed";
export type SkillOrigin = "local" | "github";
export type OriginFilter = "all" | SkillOrigin;

/**
 * Where a skill comes from. A GitHub source is `owner/repo` and is a read-only
 * original. Anything else (e.g. source "local") is a copy the user owns and can
 * edit — created either by forking a GitHub skill or forging a new one.
 */
export function skillOrigin(s: Pick<RegistrySkill, "source">): SkillOrigin {
  return /^[\w.-]+\/[\w.-]+$/.test(s.source) ? "github" : "local";
}

export interface RegistryFilter {
  q: string;
  showInstalledOnly: boolean;
  /** Tag to narrow by, or "all" for no category filter. */
  category?: string;
  /** Provenance filter — mine (local copies) vs github (originals). */
  origin?: OriginFilter;
  sort?: RegistrySort;
}

export function filterRegistry(entries: RegistrySkill[], filter: RegistryFilter): RegistrySkill[] {
  const q = filter.q.trim().toLowerCase();
  const category = filter.category && filter.category !== "all" ? filter.category : null;
  const origin = filter.origin && filter.origin !== "all" ? filter.origin : null;

  const matched = entries.filter((s) => {
    if (filter.showInstalledOnly && !s.installed) return false;
    if (origin && skillOrigin(s) !== origin) return false;
    if (category && !s.tags.includes(category)) return false;
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.source.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  if (filter.sort === "installed") {
    return [...matched].sort((a, b) => {
      if (a.installed !== b.installed) return a.installed ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }
  return matched;
}

/** Count of local (mine) vs github skills across the registry. */
export function countByOrigin(entries: RegistrySkill[]): { local: number; github: number } {
  let local = 0;
  let github = 0;
  for (const s of entries) (skillOrigin(s) === "local" ? local++ : github++);
  return { local, github };
}

/** Distinct tags across the registry, ranked by frequency then alpha. */
export function collectCategories(entries: RegistrySkill[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of entries) {
    for (const tag of s.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
