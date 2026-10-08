/**
 * The lookup the chat polls: `since` is mandatory (it is what ties files to one
 * job), the slug must be imggen-shaped before it reaches a RegExp, and seeds are
 * bounded to one job's worth.
 *
 *   pnpm exec tsx --test src/app/api/generated-images/generated-images-lookup-route.test.ts
 */
import assert from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// The root is derived from HOME at import time, so HOME must be set before the route loads.
const home = mkdtempSync(join(tmpdir(), "gen-lookup-route-"));
process.env.HOME = home;
const today = new Date().toISOString().slice(0, 10);
mkdirSync(join(home, "Documents", "Generated Images", today), { recursive: true });
writeFileSync(join(home, "Documents", "Generated Images", today, "10-00-00_fox_7.png"), "png");

const get = async (query: string) => {
  const { GET } = await import("./route");
  const res = await GET(new Request(`http://localhost/api/generated-images?${query}`));
  return { status: res.status, body: (await res.json()) as unknown };
};

const since = Date.now() - 60_000;

test("finds this job's image by seed", async () => {
  const { status, body } = await get(`name=fox&since=${since}&seeds=7`);
  assert.equal(status, 200);
  assert.deepEqual(body, { images: [{ seed: 7, date: today, filename: "10-00-00_fox_7.png" }] });
});

test("a missing or nonsensical since is rejected", async () => {
  assert.equal((await get("name=fox&seeds=7")).status, 400);
  assert.equal((await get("name=fox&since=&seeds=7")).status, 400);
  assert.equal((await get("name=fox&since=1e308&seeds=7")).status, 400);
});

test("a slug that isn't imggen-shaped never reaches the lookup", async () => {
  assert.equal((await get(`name=.*&since=${since}`)).status, 400);
  assert.equal((await get(`name=FOX&since=${since}`)).status, 400);
});

test("more seeds than one job can have are rejected", async () => {
  const seeds = Array.from({ length: 17 }, (_, i) => i).join(",");
  assert.equal((await get(`name=fox&since=${since}&seeds=${seeds}`)).status, 400);
  assert.equal((await get(`name=fox&since=${since}&seeds=1,,2`)).status, 400);
});
