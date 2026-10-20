/**
 * RULE spawn.claude-one-site (docs/conventions.md): `claude` starts only through `spawnClaude`.
 *
 *   pnpm --filter @agent-office/domain test src/services/infra/claude-bin.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../../../../..");
const SOURCES = ["packages/domain/src/**/*.ts", "apps/server/src/**/*.ts"];
const HELPER = "packages/domain/src/services/infra/claude-bin.ts";

const sources = SOURCES.flatMap((g) => globSync(g, { cwd: ROOT }))
  .map((f) => f.split("\\").join("/"))
  .filter((f) => !f.endsWith(".test.ts") && f !== HELPER);

test("no file outside the helper spawns the literal claude binary", () => {
  const spawnsClaude = /\b(?:spawn|spawnSync|execFile|execFileSync|exec|execSync)\(\s*["'`]claude["'`]/;
  const offenders = sources.filter((f) => spawnsClaude.test(readFileSync(join(ROOT, f), "utf8")));
  assert.deepStrictEqual(offenders, []);
});

test("only the helper reads AO_CLAUDE_BIN", () => {
  const offenders = sources.filter((f) => readFileSync(join(ROOT, f), "utf8").includes("AO_CLAUDE_BIN"));
  assert.deepStrictEqual(offenders, []);
});
