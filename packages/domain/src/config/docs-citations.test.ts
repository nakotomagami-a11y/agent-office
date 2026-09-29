/**
 * Every `docs/*.md` path referenced from source must exist.
 *
 * RULE docs.citations-resolve. Three dead citations shipped before this check:
 * `CLAUDE.md` (cited 7x from eslint config), `docs/redesign-v3/REDESIGN_V3_PLAN.md`,
 * and `docs/component-conventions.md`. A citation into a void sends the reader —
 * human or agent — on a search that cannot succeed.
 *
 *   pnpm --filter @agent-office/domain test
 */
import assert from "node:assert";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "../../../..");

function citedDocPaths(): Array<{ path: string; from: string }> {
  const out = execFileSync(
    "bash",
    [
      "-c",
      `grep -rhon --include='*.ts' --include='*.tsx' --include='*.mjs' ` +
        `--exclude='*.test.ts' --exclude='*.test.tsx' ` +
        `-E 'docs/[A-Za-z0-9_/-]+\\.md' packages/domain/src apps/web/src apps/web/eslint.config.mjs packages/domain/eslint.config.mjs 2>/dev/null || true`,
    ],
    { cwd: REPO, encoding: "utf8" },
  );
  const seen = new Map<string, string>();
  for (const line of out.split("\n")) {
    const m = /(docs\/[A-Za-z0-9_/-]+\.md)/.exec(line);
    if (m) seen.set(m[1]!, line.split(":")[0] ?? "?");
  }
  return [...seen].map(([path, from]) => ({ path, from }));
}

test("every docs/*.md path cited from source exists", () => {
  const missing = citedDocPaths().filter((c) => !existsSync(join(REPO, c.path)));
  assert.deepEqual(
    missing.map((m) => m.path),
    [],
    `dead documentation citations:\n  ${missing.map((m) => `${m.path} (cited from ${m.from})`).join("\n  ")}`,
  );
});
