/**
 * The root check was `root.startsWith(HOME + "/")`: on Windows every root,
 * onboarding's default `~/Documents` included, was a 400 `root_outside_home`,
 * and a `~\Projects` root was never expanded.
 *
 *   pnpm --filter @agent-office/server test src/routes/settings/scan/scan-route.test.ts
 */
import assert from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { test } from "node:test";
import { GET } from "./route";

const scan = (root: string) =>
  GET(new Request(`http://localhost/api/settings/scan?root=${encodeURIComponent(root)}`));

mkdirSync(join(homedir(), "Documents", "alpha"), { recursive: true });

for (const root of ["~/Documents", `~${sep}Documents`, join(homedir(), "Documents")]) {
  test(`a root inside home is scanned: ${root}`, async () => {
    const res = await scan(root);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Array<{ name: string }>;
    assert.deepEqual(body.map((e) => e.name), ["alpha"]);
  });
}

test("home itself is allowed", async () => {
  assert.equal((await scan("~")).status, 200);
});

test("a root outside home, or escaping it, is refused", async () => {
  assert.equal((await scan(dirname(homedir()))).status, 400);
  assert.equal((await scan("~/../")).status, 400);
  assert.equal((await scan(`${homedir()}-sibling`)).status, 400, "a shared prefix is not inside home");
});

test("a root inside home that is a junction to another drive is still scanned", async () => {
  // Windows users move Documents with `mklink /J`; following the link put it outside home.
  const elsewhere = mkdtempSync(join(tmpdir(), "ao-scan-elsewhere-"));
  mkdirSync(join(elsewhere, "beta"));
  symlinkSync(elsewhere, join(homedir(), "Linked"), "junction");
  try {
    const res = await scan("~/Linked");
    assert.equal(res.status, 200);
    assert.deepEqual(((await res.json()) as Array<{ name: string }>).map((e) => e.name), ["beta"]);
  } finally {
    rmSync(join(homedir(), "Linked"), { force: true, recursive: false });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});
