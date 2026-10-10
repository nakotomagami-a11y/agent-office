/**
 * Which files an image-job card may claim, and whether it still polls. A wrong
 * bound either hides the job's own late images or shows a retry's.
 *
 *   pnpm --filter @agent-office/web test src/modules/summon/format/image-job-window.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import type { ImggenJob } from "./imggen-command";
import { imageJobWindow } from "./image-job-window";

const job = (background: boolean): ImggenJob => ({ slug: "fox", count: 1, seeds: null, background, offset: 0 });
const T = 1_000_000;
const BUDGET = 120_000 + 45_000;

test("foreground: polls until its call returns, then is bounded by that time", () => {
  assert.deepEqual(imageJobWindow(job(false), T, undefined, true, T + 5_000), { untilMs: undefined, live: true, expiresAt: undefined });
  assert.deepEqual(imageJobWindow(job(false), T, T + 9_000, true, T + 9_500), { untilMs: T + 9_000, live: false, expiresAt: undefined });
});

test("background: bounded and polled until its deadline, past the end of the turn", () => {
  const w = imageJobWindow(job(true), T, T + 50, false, T + 60_000);
  assert.deepEqual(w, { untilMs: T + 50 + BUDGET, live: true, expiresAt: T + 50 + BUDGET });
  assert.deepEqual(imageJobWindow(job(true), T, T + 50, false, T + 50 + BUDGET), { untilMs: T + 50 + BUDGET, live: false, expiresAt: undefined });
});

test("before its call returns, a background job's budget counts from the start", () => {
  assert.equal(imageJobWindow(job(true), T, undefined, true, T).untilMs, T + BUDGET);
});

test("a call the CLI backgrounded after a long timeout gets its budget from the return", () => {
  const doneTs = T + 600_000;
  const w = imageJobWindow(job(true), T, doneTs, false, doneTs + 1_000);
  assert.equal(w.untilMs, doneTs + BUDGET);
  assert.equal(w.expiresAt, doneTs + BUDGET, "a fresh expiry, though the start-based one already passed");
  assert.ok(w.live);
});

test("a reap or abort hours later cannot stretch the window onto a retry", () => {
  const w = imageJobWindow(job(true), T, T + 3_600_000, false, T + 3_600_000);
  assert.equal(w.untilMs, T + 600_000 + BUDGET);
  assert.equal(w.live, false);
});
