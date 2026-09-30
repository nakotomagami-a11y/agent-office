// Rule ids the Loop's reviewer may cite. The machine rejects a whole findings
// batch whose citations do not resolve, so this must track the doc — a stale
// hard-coded list would reject correct reviews.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONVENTIONS = join(
  dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..",
  "docs", "conventions.md",
);

let cache: { mtimeMs: number; ids: Set<string> } | null = null;

/** `## <rule-id>` headings in docs/conventions.md. Re-read when the file
 *  changes so editing the doc does not need a restart. */
export function knownRuleIds(): Set<string> {
  if (!existsSync(CONVENTIONS)) return new Set();
  const mtimeMs = statSync(CONVENTIONS).mtimeMs;
  if (cache && cache.mtimeMs === mtimeMs) return cache.ids;
  const ids = new Set<string>();
  for (const line of readFileSync(CONVENTIONS, "utf8").split("\n")) {
    const m = /^## ([a-z][a-z0-9]*(?:[.-][a-z0-9]+)+)\s*$/.exec(line);
    if (m) ids.add(m[1]!);
  }
  cache = { mtimeMs, ids };
  return ids;
}

export function ruleExists(id: string): boolean {
  return knownRuleIds().has(id.trim());
}
