/**
 * "Forge agent" POSTs here, and the id is slugged from the name: "Developer" became
 * `developer.md` and overwrote the existing agent with no backup (S1-6).
 *
 *   pnpm --filter @agent-office/server test src/routes/agents/agents-route.test.ts
 */
import assert from "node:assert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { paths } from "@agent-office/domain/services";
import { POST } from "./route";
import { POST as bulkPost } from "./bulk/route";
import { PUT as put } from "./[id]/route";
import * as bodyRoute from "./[id]/body/route";

/** Each test that needs the id taken takes it itself, so any one of them can run alone. */
function takeId(): string {
  mkdirSync(paths.AGENTS_DIR, { recursive: true });
  const file = join(paths.AGENTS_DIR, "route-taken.md");
  writeFileSync(file, "---\nname: route-taken\ndescription: mine\n---\n\nmine\n");
  return file;
}

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/agents", { method: "POST", body: JSON.stringify(body) }));

test("creating an agent whose id is taken is a 409 agent_exists, and the file is untouched", async () => {
  const file = takeId();

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
  takeId();
  const res = await bulkPost(new Request("http://localhost/api/agents/bulk", {
    method: "POST",
    body: JSON.stringify([{ id: "route-taken", name: "x", desc: "theirs", body: "theirs" }, { id: "route-bulk-new", name: "y", desc: "d", body: "b" }]),
  }));
  assert.equal(res.status, 207);
  assert.deepEqual(await res.json(), { written: ["route-bulk-new"], errors: [{ id: "route-taken", error: "agent_exists" }] });
  assert.match(readFileSync(join(paths.AGENTS_DIR, "route-taken.md"), "utf8"), /mine/);
});

test("bulk create where every id is taken is a 409, not a server error", async () => {
  takeId();
  const res = await bulkPost(new Request("http://localhost/api/agents/bulk", {
    method: "POST",
    body: JSON.stringify([{ id: "route-taken", name: "x", desc: "theirs", body: "theirs" }]),
  }));
  assert.equal(res.status, 409);
});

const putAgent = (id: string, body: unknown) =>
  put(new Request(`http://localhost/api/agents/${id}`, { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

test("PUT edits an existing agent and never creates one", async () => {
  const missing = await putAgent("route-nobody", { id: "route-nobody", name: "x", desc: "d", body: "b" });
  assert.equal(missing.status, 404);
  assert.equal(existsSync(join(paths.AGENTS_DIR, "route-nobody.md")), false);

  takeId();
  const res = await putAgent("route-taken", { id: "route-taken", name: "Route Taken", desc: "edited", body: "mine" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { id: "route-taken" });
  assert.match(readFileSync(join(paths.AGENTS_DIR, "route-taken.md"), "utf8"), /description: edited/);
});

test("the body route only reads: its PUT, which wiped CRLF frontmatter, is gone", () => {
  assert.equal("PUT" in bodyRoute, false);
  assert.equal(typeof bodyRoute.GET, "function");
});

test("PUT with only a name and a model keeps the prompt, tools, skills and permission mode", async () => {
  const file = join(paths.AGENTS_DIR, "route-partial.md");
  writeFileSync(file, "---\nname: route-partial\ndescription: d\ntools: [Read, Bash]\nskills: [alpha]\npermission-mode: plan\n---\n\nmy prompt\n");
  const res = await putAgent("route-partial", { name: "route-partial", model: "opus" });
  assert.equal(res.status, 200);
  const saved = readFileSync(file, "utf8");
  for (const kept of ["tools: [Read, Bash]", "skills: [alpha]", "permission-mode: plan", "my prompt", "default-model: opus"]) {
    assert.ok(saved.includes(kept), `lost: ${kept}`);
  }
});
