// Parse/serialize an agent's CLAUDE.md-style memory file into grouped facts.

export type Fact = { id: string; k: string; v: string };
export type Group = { key: string; facts: Fact[] };

export function parseMemory(raw: string): Group[] {
  const lines = raw.split("\n");
  const groups: Group[] = [];
  let current: Group | undefined;
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const groupMatch = line.match(/^([a-zA-Z0-9_-]+):\s*$/);
    if (groupMatch) {
      const key = groupMatch[1] ?? "";
      current = { key, facts: [] };
      groups.push(current);
      continue;
    }
    const factMatch = line.match(/^\s{1,}([^:]+?)\s*:\s*(.*)$/);
    if (factMatch && current) {
      const k = factMatch[1]?.trim() ?? "";
      const v = factMatch[2]?.trim() ?? "";
      current.facts.push({ id: `${current.key}_${k}_${groups.length}`, k, v });
    }
  }
  return groups;
}

export function serializeMemory(groups: Group[]): string {
  return groups.map((g) => {
    const lines = [`${g.key}:`];
    for (const f of g.facts) {
      if (f.k) lines.push(`  ${f.k}: ${f.v}`);
    }
    return lines.join("\n");
  }).join("\n\n");
}
