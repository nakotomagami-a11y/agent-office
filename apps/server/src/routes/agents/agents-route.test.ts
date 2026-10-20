/**
 * "Forge agent" POSTs here, and the id is slugged from the name: "Developer" became
 * `developer.md` and overwrote the existing agent with no backup (S1-6).
 *
 *   pnpm --filter @agent-office/server test src/routes/agents/agents-route.test.ts
 */
import assert from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { paths } from "@agent-office/domain/services";
import { POST } from "./route";
import { POST as bulkPost } from "./bulk/route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/agents", { method: "POST", body: JSON.stringify(body) }));

test("creating an agent whose id is taken is a 409 agent_exists, and the file is untouched", async () => {
  mkdirSync(paths.AGENTS_DIR, { recursive: true });
  const file = join(paths.AGENTS_DIR, "route-taken.md");
  writeFileSync(file, "---\nname: route-taken\ndescription: mine\n---\n\nmine\n");

  const res = await post({ id: "route-taken", name: "Route Taken", desc: "theirs", body: "theirs" });
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "agent_exists", id: "route-taken" });
  assert.match(readFileSync(file, "utf8"), /mine/);
});

test("a free id is created", async () => {
  const res = await post({ id: "route-free", name: "Route Free", desc: "d", body: "b" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { id: "route-free" });
});

test("bulk create never overwrites either: a taken id is an item error", async () => {
  const res = await bulkPost(new Request("http://localhost/api/agents/bulk", {
    method: "POST",
    body: JSON.stringify([{ id: "route-taken", name: "x", desc: "theirs", body: "theirs" }, { id: "route-bulk-new", name: "y", desc: "d", body: "b" }]),
  }));
  assert.equal(res.status, 207);
  assert.deepEqual(await res.json(), { written: ["route-bulk-new"], errors: [{ id: "route-taken", error: "agent_exists" }] });
  assert.match(readFileSync(join(paths.AGENTS_DIR, "route-taken.md"), "utf8"), /mine/);
});
