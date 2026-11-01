/**
 * Windows `relative()` returns backslash paths; splitting on "/" once leaked
 * them into the project action menu as "Apps\web · Start".
 *
 *   pnpm --filter @agent-office/domain test src/services/projects/project-runtime.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectDevCommands } from "./project-runtime";

test("workspace subfolder commands get slash-free keys and labels", () => {
  const root = mkdtempSync(join(tmpdir(), "ao-runtime-"));
  try {
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - 'apps/*'\n");
    writeFileSync(join(root, "pnpm-lock.yaml"), "");
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: {} }));
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    writeFileSync(join(root, "apps", "web", "package.json"), JSON.stringify({ scripts: { dev: "vite" } }));

    const commands = detectDevCommands(root);
    const web = commands.find((c) => c.name === "Web · Dev");
    assert.ok(web, JSON.stringify(commands.map((c) => c.name)));
    assert.strictEqual(web.key, "apps-web-dev");
    for (const c of commands) assert.doesNotMatch(`${c.key} ${c.name}`, /[\\/]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
