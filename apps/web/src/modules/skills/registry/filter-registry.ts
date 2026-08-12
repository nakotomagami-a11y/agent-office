import type { RegistrySkill } from "@agent-office/domain/types";

export interface RegistryFilter {
  q: string;
  showInstalledOnly: boolean;
}

export function filterRegistry(entries: RegistrySkill[], filter: RegistryFilter): RegistrySkill[] {
  const q = filter.q.trim().toLowerCase();
  return entries.filter((s) => {
    if (filter.showInstalledOnly && !s.installed) return false;
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.source.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q))
    );
  });
}
