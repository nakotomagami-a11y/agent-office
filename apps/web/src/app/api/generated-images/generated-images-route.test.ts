/**
 * Serves only dated raster files inside the images root; traversal, hidden files, SVG,
 * symlinks that leave the root, and non-regular files (FIFOs) are all refused.
 *
 *   pnpm exec tsx --test src/app/api/generated-images/generated-images-route.test.ts
 */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// The root is derived from HOME at import time, so HOME must be set before the route loads.
const home = mkdtempSync(join(tmpdir(), "gen-img-"));
process.env.HOME = home;
const day = join(home, "Documents", "Generated Images", "2026-10-08");
mkdirSync(day, { recursive: true });
writeFileSync(join(day, "ok.png"), "png-bytes");
writeFileSync(join(day, "a.svg"), "<svg/>");
writeFileSync(join(home, "secret.txt"), "secret");
symlinkSync(join(home, "secret.txt"), join(day, "leak.png"));
execFileSync("mkfifo", [join(day, "pipe.png")]);

const status = async (date: string, filename: string): Promise<number> => {
  const { GET } = await import("./[date]/[filename]/route");
  const res = await GET(new Request("http://localhost/"), { params: Promise.resolve({ date, filename }) });
  return res.status;
};

test("serves a real image with its content type", async () => {
  const { GET } = await import("./[date]/[filename]/route");
  const res = await GET(new Request("http://localhost/"), { params: Promise.resolve({ date: "2026-10-08", filename: "ok.png" }) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
});

test("a missing file is 404", async () => {
  assert.equal(await status("2026-10-08", "nope.png"), 404);
});

test("malformed dates, traversal, hidden files and svg are 400", async () => {
  assert.equal(await status("2026-10-8", "ok.png"), 400);
  assert.equal(await status("..", "ok.png"), 400);
  assert.equal(await status("2026-10-08", "../../secret.txt"), 400);
  assert.equal(await status("2026-10-08", ".hidden.png"), 400);
  assert.equal(await status("2026-10-08", "a.svg"), 400);
});

test("a symlink pointing outside the root is not served", async () => {
  assert.equal(await status("2026-10-08", "leak.png"), 404);
});

test("a FIFO is not served: reading it would block the whole server", async () => {
  assert.equal(await status("2026-10-08", "pipe.png"), 404);
});
