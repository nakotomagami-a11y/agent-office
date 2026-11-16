/**
 * Any local folder on any drive is scanned (projects often live on D:\Lab). A root the rule refuses
 * (`settings.projectsRootProblem`) is a 400 with its code, never an empty list the UI would show as
 * "nothing under that root".
 *
 *   pnpm --filter @agent-office/server test src/routes/settings/scan/scan-route.test.ts
 */
import assert from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, parse, sep } from "node:path";
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

test("a root outside home, even on another drive, is scanned", async () => {
  // Projects often live on a second drive (D:\Lab); only listing folder names happens here.
  const elsewhere = mkdtempSync(join(tmpdir(), "ao-scan-outside-"));
  mkdirSync(join(elsewhere, "gamma"));
  try {
    const res = await scan(elsewhere);
    assert.equal(res.status, 200);
    assert.deepEqual(((await res.json()) as Array<{ name: string }>).map((e) => e.name), ["gamma"]);
  } finally {
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

test("a refused root is a 400 with its code", async () => {
  const res = await scan(parse(homedir()).root);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "root_is_drive_root" });
  assert.deepEqual(await (await scan("Lab")).json(), { error: "root_not_absolute" });
  const dir = mkdtempSync(join(tmpdir(), "ao-scan-file-"));
  try {
    writeFileSync(join(dir, "notes.txt"), "");
    assert.deepEqual(await (await scan(join(dir, "notes.txt"))).json(), { error: "root_not_a_directory" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a network path is refused before anything touches it", { skip: process.platform !== "win32" }, async () => {
  // A web page could otherwise point the scan at \\attacker\share and collect the user's login hash.
  assert.deepEqual(await (await scan("\\\\192.0.2.1\\s\\x")).json(), { error: "root_not_local" });
});

test("a root that doesn't exist yet is an empty list", async () => {
  const res = await scan(join(tmpdir(), "ao-scan-missing-root-does-not-exist"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
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
