/**
 * `docs/architecture.md` documented a database that no longer existed: the
 * wrong `user_version`, a table (`loops`) that was never added, columns that
 * had been DROPPED, and an SSE payload that contradicted the same file 136
 * lines earlier.
 *
 * `CLAUDE.md` tells every agent to read that file before writing code, and
 * `docs.citations-resolve` only guarantees paths resolve — not that content is
 * true. So drift was invisible. This is the missing half of that rule.
 *
 *   pnpm --filter @agent-office/domain test
 */
import assert from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createSchema } from "./migrations";

const DOC = join(import.meta.dirname, "../../../../../docs/architecture.md");
const doc = readFileSync(DOC, "utf8");

function schemaDb(): Database.Database {
  const mem = new Database(":memory:");
  createSchema(mem);
  return mem;
}

test("the documented user_version matches the schema the code creates", () => {
  const actual = schemaDb().pragma("user_version", { simple: true });
  const documented = /tracked via `user_version` — currently at \*\*v(\d+)\*\*/.exec(doc)?.[1];
  assert.ok(documented, "architecture.md no longer states a user_version in the expected form");
  assert.equal(
    Number(documented),
    actual,
    `architecture.md says v${documented}, the schema is v${actual} — a migration landed without updating the doc`,
  );
});

test("every table the schema creates appears in the architecture doc", () => {
  // `loops` shipped across four PRs and was never documented at all.
  const db = schemaDb();
  const tables = (
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>
  )
    .map((r) => r.name)
    // FTS5 shadow tables are an implementation detail of `messages_fts`.
    .filter((n) => !/^messages_fts_/.test(n));

  const missing = tables.filter((t) => !doc.includes(`\`${t}\``));
  assert.deepEqual(missing, [], `tables missing from docs/architecture.md: ${missing.join(", ")}`);
});

test("no documented column has been dropped from the schema", () => {
  // `agent_context_measurements` was documented with `mcp_tokens` and
  // `mcp_server_names` for three migrations after both were dropped — an agent
  // writing that query produces code that cannot run.
  const db = schemaDb();
  const rows = /^\| `(\w+)` \| ([^|]+)\|/gm;
  const problems: string[] = [];
  for (const m of doc.matchAll(rows)) {
    const table = m[1]!;
    const exists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(table) as { name: string } | undefined;
    if (!exists) continue;
    const real = new Set(
      (db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as Array<{ name: string }>).map((c) => c.name),
    );
    for (const token of m[2]!.split(",")) {
      // Only bare snake_case identifiers; the column cells also carry prose
      // like "PK(agent_id, instance_id)" and "status (`idle`|`running`)".
      const name = token.trim();
      if (!/^[a-z][a-z0-9_]*$/.test(name)) continue;
      if (!real.has(name)) problems.push(`${table}.${name}`);
    }
  }
  assert.deepEqual(problems, [], `documented columns that do not exist: ${problems.join(", ")}`);
});
