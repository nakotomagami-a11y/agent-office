/**
 * Saving the projects root applies the same rule as its live preview (`scan/route.ts`): a refused root is never
 * written, so Settings can't save a root its preview rejected, and any local folder on any drive saves.
 *
 *   pnpm --filter @agent-office/server test src/routes/settings/settings-route.test.ts
 */
import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, parse } from "node:path";
import { test } from "node:test";
import { settings } from "@agent-office/domain/services";
import { setSelection } from "@agent-office/domain/services/providers/store";
import { PUT } from "./route";

const put = (projectsRoot: string) =>
  PUT(new Request("http://localhost/api/settings", { method: "PUT", body: JSON.stringify({ projectsRoot, excluded: [] }) }));

test("a drive root is refused and not saved", async () => {
  const driveRoot = parse(homedir()).root;
  const res = await put(driveRoot);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "root_is_drive_root" });
  // Other test files in this run write settings too: check only what this PUT would have saved.
  assert.notEqual(settings.readSettings()?.projectsRoot, driveRoot);
});

test("a folder outside home saves, and so does one that doesn't exist yet", async () => {
  setSelection("subscription", "chosen");
  const elsewhere = mkdtempSync(join(tmpdir(), "ao-settings-root-"));
  try {
    for (const root of [elsewhere, join(elsewhere, "not-yet")]) {
      const res = await put(root);
      assert.equal(res.status, 200, root);
      assert.equal(((await res.json()) as { projectsRoot: string }).projectsRoot, root);
    }
  } finally {
    rmSync(elsewhere, { recursive: true, force: true });
  }
});
