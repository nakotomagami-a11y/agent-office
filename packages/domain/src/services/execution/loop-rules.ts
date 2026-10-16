// Rule ids the Loop's reviewer may cite. The machine rejects a whole findings
// batch whose citations do not resolve, so the set is the general rules plus
// the `## <rule-id>` headings of the REVIEWED project's docs/conventions.md —
// never Agent Office's own, which mean nothing in someone else's repo.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { GENERAL_LOOP_RULES } from "../../config/loop";

const cache = new Map<string, { mtimeMs: number; ids: Set<string> }>();

/** Re-read when the file changes so editing the doc does not need a restart. */
function projectRuleIds(cwd: string): Set<string> {
  const file = join(cwd, "docs", "conventions.md");
  if (!existsSync(file)) return new Set();
  const mtimeMs = statSync(file).mtimeMs;
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === mtimeMs) return hit.ids;
  const ids = new Set<string>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^## ([a-z][a-z0-9]*(?:[.-][a-z0-9]+)+)\s*$/.exec(line);
    if (m) ids.add(m[1]!);
  }
  cache.set(file, { mtimeMs, ids });
  return ids;
}

export function knownRuleIds(cwd: string | null): Set<string> {
  return new Set([...GENERAL_LOOP_RULES, ...(cwd ? projectRuleIds(cwd) : [])]);
}

export function ruleExists(id: string, cwd: string | null): boolean {
  return knownRuleIds(cwd).has(id.trim());
}
