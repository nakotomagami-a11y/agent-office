/**
 * Which files an image-job card may claim, and whether it still polls. A wrong
 * bound either hides the job's own late images or shows a retry's.
 *
 *   pnpm exec tsx --test src/modules/summon/format/image-job-window.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import type { ImggenJob } from "./imggen-command";
import { imageJobWindow } from "./image-job-window";

const job = (background: boolean): ImggenJob => ({ slug: "fox", count: 1, seeds: null, background, offset: 0 });
const T = 1_000_000;

test("foreground: polls until its call returns, then is bounded by that time", () => {
  assert.deepEqual(imageJobWindow(job(false), T, undefined, true, T + 5_000), { untilMs: undefined, live: true, deadline: undefined });
  assert.deepEqual(imageJobWindow(job(false), T, T + 9_000, true, T + 9_500), { untilMs: T + 9_000, live: false, deadline: undefined });
});

test("background: bounded and polled until its deadline, past the end of the turn", () => {
  const w = imageJobWindow(job(true), T, T + 50, false, T + 60_000);
  assert.equal(w.untilMs, w.deadline);
  assert.ok(w.live);
  assert.equal(imageJobWindow(job(true), T, T + 50, false, w.deadline! + 1).live, false);
});

test("a call the CLI backgrounded after a long timeout gets its budget from the return", () => {
  const doneTs = T + 600_000;
  const w = imageJobWindow(job(true), T, doneTs, false, doneTs + 1_000);
  assert.ok(w.deadline! > doneTs, "the deadline must not end before the call even returned");
  assert.ok(w.live);
});
