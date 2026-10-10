/**
 * The chat's image-job card fills its placeholders from this lookup, so it must
 * return exactly this job's finished files: right slug, written at or after the
 * job's tool call, the job's own run when a slug+seed is reused, never imggen's
 * in-progress `.part` files, and it must stay bounded and quiet on odd folder
 * contents because it is polled every 1.5s.
 *
 *   pnpm --filter @agent-office/domain test src/services/infra/generated-images.test.ts
 */
import assert from "node:assert";
import { mkdirSync, mkdtempSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { findGeneratedImages } from "./generated-images";

const root = mkdtempSync(join(tmpdir(), "gen-lookup-"));
const NOW = Date.now();
const MIN = 60_000;
const day = (offset: number) => new Date(NOW + offset * 86_400_000).toISOString().slice(0, 10);
const put = (date: string, name: string, mtimeMs: number) => {
  mkdirSync(join(root, date), { recursive: true });
  const p = join(root, date, name);
  writeFileSync(p, "x");
  utimesSync(p, mtimeMs / 1000, mtimeMs / 1000);
};

const TODAY = day(0);
put(day(-1), "23-59-00_cats_10.png", NOW - 20 * 60 * MIN);
put(TODAY, "10-00-00_cats_10.png", NOW - 10 * MIN);
put(TODAY, "10-00-10_cats_11.png", NOW - 9 * MIN);
put(TODAY, ".10-00-20_cats_12.png.part", NOW - 8 * MIN);
put(TODAY, "10-00-30_cats-and-dogs_12.png", NOW - 7 * MIN);
put(TODAY, "10-00-40_dogs_12.png", NOW - 6 * MIN);
put(TODAY, "10-05-00_cats_10.png", NOW - 2 * MIN);
put(day(-30), "10-00-00_old_1.png", NOW - 30 * 86_400_000);
put("notes", "10-00-50_cats_13.png", NOW - MIN);

test("seeded: this job's run of each seed, in seed order; missing seeds omitted", () => {
  assert.deepEqual(findGeneratedImages({ slug: "cats", sinceMs: NOW - 11 * MIN, seeds: [11, 10, 12] }, root), [
    { seed: 11, date: TODAY, filename: "10-00-10_cats_11.png" },
    { seed: 10, date: TODAY, filename: "10-00-00_cats_10.png" },
  ]);
});

test("seeded: a later re-run of the same slug+seed does not replace this job's file", () => {
  const first = findGeneratedImages({ slug: "cats", sinceMs: NOW - 11 * MIN, seeds: [10] }, root);
  const rerun = findGeneratedImages({ slug: "cats", sinceMs: NOW - 3 * MIN, seeds: [10] }, root);
  assert.equal(first[0]!.filename, "10-00-00_cats_10.png");
  assert.equal(rerun[0]!.filename, "10-05-00_cats_10.png");
});

test("a file written after the job's tool call returned belongs to a retry, not to it", () => {
  const failed = { slug: "cats", sinceMs: NOW - 3 * MIN, untilMs: NOW - 2.5 * MIN };
  assert.deepEqual(findGeneratedImages({ ...failed, seeds: null }, root), []);
  assert.deepEqual(findGeneratedImages({ ...failed, seeds: [10] }, root), []);
  assert.equal(findGeneratedImages({ ...failed, untilMs: NOW - 2 * MIN, seeds: [10] }, root).length, 1, "inclusive bound");
});

test("a date folder past tomorrow is never scanned", () => {
  put(day(400), "10-00-00_future_1.png", NOW);
  assert.deepEqual(findGeneratedImages({ slug: "future", sinceMs: NOW - MIN, seeds: null }, root), []);
});

test("seeded: a file from before the job started never fills its slot", () => {
  assert.deepEqual(findGeneratedImages({ slug: "cats", sinceMs: NOW - MIN, seeds: [10, 11] }, root), []);
});

test("seedless: this slug's files since the job started, oldest first", () => {
  assert.deepEqual(
    findGeneratedImages({ slug: "cats", sinceMs: NOW - 9.5 * MIN, seeds: null }, root).map((r) => r.filename),
    ["10-00-10_cats_11.png", "10-05-00_cats_10.png"],
  );
  assert.equal(findGeneratedImages({ slug: "cats", sinceMs: NOW - 24 * 60 * MIN, seeds: null }, root).length, 4);
});

test("a since older than a week is refused, not moved forward onto a later run", () => {
  assert.deepEqual(findGeneratedImages({ slug: "cats", sinceMs: NOW - 8 * 86_400_000, seeds: [10] }, root), []);
});

test("since=1 cannot scan all history", () => {
  assert.deepEqual(findGeneratedImages({ slug: "old", sinceMs: 1, seeds: null }, root), []);
  assert.deepEqual(findGeneratedImages({ slug: "old", sinceMs: 1, seeds: [1] }, root), []);
});

test("a slug that is a prefix of another does not match it", () => {
  assert.deepEqual(findGeneratedImages({ slug: "cats", sinceMs: NOW - 60 * MIN, seeds: [12] }, root), []);
});

test("a slug that is not imggen-shaped is refused, not turned into a regex", () => {
  assert.deepEqual(findGeneratedImages({ slug: ".*", sinceMs: NOW - 60 * MIN, seeds: [10] }, root), []);
  assert.deepEqual(findGeneratedImages({ slug: "cats|dogs", sinceMs: NOW - 60 * MIN, seeds: null }, root), []);
});

test("symlinked or plain-file 'date' entries are skipped without throwing", () => {
  const other = mkdtempSync(join(tmpdir(), "gen-other-"));
  writeFileSync(join(other, "10-00-00_cats_77.png"), "x");
  symlinkSync(other, join(root, day(1)));
  writeFileSync(join(root, day(2)), "not a dir");
  assert.deepEqual(findGeneratedImages({ slug: "cats", sinceMs: NOW - 60 * MIN, seeds: [77] }, root), []);
  assert.equal(findGeneratedImages({ slug: "cats", sinceMs: NOW - 60 * MIN, seeds: [10] }, root).length, 1);
});

test("a missing root is empty, not an error", () => {
  assert.deepEqual(findGeneratedImages({ slug: "cats", sinceMs: NOW, seeds: [1] }, join(root, "nope")), []);
});
