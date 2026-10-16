// Rule ids the Loop's reviewer may cite. The machine rejects a whole findings
// batch whose citations do not resolve, so the set is the general rules plus
// the `## <rule-id>` headings of the REVIEWED project's docs/conventions.md —
// never Agent Office's own, which mean nothing in someone else's repo.

import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GENERAL_LOOP_RULES } from "../../config/loop";
import { log } from "../infra/log";

/** The file is the reviewed repo's content, read on the server's event loop:
 *  a symlink to /dev/zero or a FIFO would hang it, and every id becomes a line
 *  of every review prompt. */
const MAX_BYTES = 256 * 1024;
const MAX_IDS = 200;

const cache = new Map<string, { mtimeMs: number; ids: Set<string> }>();

/** Re-read when the file changes so editing the doc does not need a restart. */
function projectRuleIds(cwd: string): Set<string> {
  const file = join(cwd, "docs", "conventions.md");
  const st = lstatSync(file, { throwIfNoEntry: false });
  if (!st?.isFile() || st.size > MAX_BYTES) return new Set();
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs) return hit.ids;
  const ids = new Set<string>();
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = /^## ([a-z][a-z0-9]*(?:[.-][a-z0-9]+)+)\s*$/.exec(line);
      if (m) ids.add(m[1]!);
      if (ids.size >= MAX_IDS) break;
    }
  } catch (err) {
    log.warn("loop.conventions_unreadable", { file, err: String(err) });
    return new Set();
  }
  cache.set(file, { mtimeMs: st.mtimeMs, ids });
  return ids;
}

export function knownRuleIds(cwd: string | null): Set<string> {
  return new Set([...GENERAL_LOOP_RULES, ...(cwd ? projectRuleIds(cwd) : [])]);
}

export function ruleExists(id: string, cwd: string | null): boolean {
  return knownRuleIds(cwd).has(id.trim());
}
