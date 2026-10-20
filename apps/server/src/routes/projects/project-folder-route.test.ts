/**
 * Delete folder needs the exact path the user confirmed, and says so with a
 * code when that path is not the folder the id names under the saved root.
 *
 *   pnpm --filter @agent-office/server test src/routes/projects/project-folder-route.test.ts
 */
import assert from "node:assert";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DELETE } from "./[id]/folder/route";

const root = join(homedir(), "folder-route-root");
const target = join(root, "alpha");
mkdirSync(target, { recursive: true });
mkdirSync(join(homedir(), ".claude"), { recursive: true });
writeFileSync(join(homedir(), ".claude", "agent-office-settings.json"), JSON.stringify({ projectsRoot: root, excluded: [] }));

const del = (query: string) =>
  DELETE(new Request(`http://localhost/api/projects/alpha/folder${query}`, { method: "DELETE" }), {
    params: Promise.resolve({ id: "alpha" }),
  });

test("no path: 400, nothing deleted", async () => {
  assert.equal((await del("")).status, 400);
  assert.equal(existsSync(target), true);
});

test("a path that is not the folder the id names: 404 folder_mismatch, nothing deleted", async () => {
  const res = await del(`?path=${encodeURIComponent(join(homedir(), "elsewhere", "alpha"))}`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "folder_mismatch" });
  assert.equal(existsSync(target), true);
});

test("the confirmed path: deleted", async () => {
  const res = await del(`?path=${encodeURIComponent(target)}`);
  assert.equal(res.status, 200);
  assert.equal(existsSync(target), false);
});
