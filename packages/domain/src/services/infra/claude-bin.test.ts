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

const SPAWNS_CLAUDE = /\b(?:spawn|spawnSync|execFile|execFileSync|exec|execSync)\(\s*["'`]claude\b/;
const BYPASSES_HELPER = /\bclaudeBin\(|AO_CLAUDE_BIN/;
const violates = (src: string): boolean => SPAWNS_CLAUDE.test(src) || BYPASSES_HELPER.test(src);

const sources = SOURCES.flatMap((g) => globSync(g, { cwd: ROOT }))
  .map((f) => f.split("\\").join("/"))
  .filter((f) => !f.endsWith(".test.ts") && f !== HELPER);

test("the scan catches every way around the helper", () => {
  for (const bad of [
    `spawn("claude", args)`, "execSync(\"claude --version\")", "spawn(`claude ${x}`)", "execFile('claude')",
    "spawn(claudeBin(), args)", "process.env.AO_CLAUDE_BIN",
  ]) {
    assert.ok(violates(bad), bad);
  }
  for (const fine of [`spawnClaude(["--version"], {})`, `spawn("claudette")`, `spawn(command, args)`]) {
    assert.ok(!violates(fine), fine);
  }
});

test("no file outside the helper starts claude on its own", () => {
  const offenders = sources.filter((f) => violates(readFileSync(join(ROOT, f), "utf8")));
  assert.deepStrictEqual(offenders, []);
});
