/**
 * Starter-data agents are what a NEW user gets. `agent-surface.test.ts` gates
 * `listAgents()` — the user's own `~/.claude/agents` — so the shipped copies
 * were never checked, and 30 of them declared tools the catalog did not list.
 * A declared tool the CLI does not know grants nothing, silently.
 *
 * `Grep`/`Glob` were the original offenders here and have since been confirmed
 * REAL on CLI v2.1.277 — `claude -p --agent <name>` grants `Grep` to an agent
 * that declares it. They are now in `KNOWN_TOOLS`, so this test no longer
 * flags them. The guarantee it enforces is unchanged: every declared name must
 * appear in the catalog.
 *
 * Regenerate the catalog after a CLI upgrade — see config/tools.ts.
 */
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { unknownTools } from "../../config/tools";

const DIR = resolve(import.meta.dirname, "../../../../../apps/web/starter-data/agents");

/**
 * EVERY `tools: [...]` in the file, not just the frontmatter one. agent-architect
 * carries a second copy inside the template it shows when writing a new agent,
 * and that template taught `Grep` — which is how thirty agents came to declare a
 * tool that does not exist. Checking only the first match let it survive #152.
 */
function declaredToolLists(file: string): string[][] {
  const src = readFileSync(join(DIR, file), "utf8");
  return [...src.matchAll(/^tools: \[([^\]]*)\]/gm)]
    .map((m) => m[1]!.split(",").map((t) => t.trim()).filter(Boolean));
}

test("the starter-data agent set is non-empty and readable", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".md"));
  assert.ok(files.length > 10, `expected the shipped agent set, found ${files.length}`);
});

test("every tool a SHIPPED agent declares actually exists", () => {
  const offenders: string[] = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".md"))) {
    for (const tools of declaredToolLists(f)) {
      const bad = unknownTools(tools);
      if (bad.length > 0) offenders.push(`${f}: ${bad.join(", ")}`);
    }
  }
  assert.deepEqual(offenders, [], `shipped agents grant nothing silently:\n  ${offenders.join("\n  ")}`);
});

test("no shipped agent is left with an empty tool list", () => {
  const empty: string[] = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".md"))) {
    const s = readFileSync(join(DIR, f), "utf8");
    if (/^tools: \[\s*\]/m.test(s)) empty.push(f);
  }
  assert.deepEqual(empty, [], "a tools: [] frontmatter disables the agent entirely");
});
