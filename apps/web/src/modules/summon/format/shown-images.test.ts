/**
 * Dedupe must key on what a card is actually showing: two cards can show the same
 * URL, and one unmounting must not make the closing message's copy vanish or reappear
 * wrongly.
 *
 *   pnpm exec tsx --test src/modules/summon/format/shown-images.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { createShownImages } from "./shown-images";

test("a URL is shown until every card that added it removes it", () => {
  const s = createShownImages();
  s.add(["/a.png"]);
  s.add(["/a.png", "/b.png"]);
  s.remove(["/a.png"]);
  assert.equal(s.has("/a.png"), true);
  s.remove(["/a.png", "/b.png"]);
  assert.equal(s.has("/a.png"), false);
  assert.equal(s.has("/b.png"), false);
});

test("subscribers hear every change and the version moves", () => {
  const s = createShownImages();
  let calls = 0;
  const off = s.subscribe(() => calls++);
  const v0 = s.version();
  s.add(["/a.png"]);
  s.remove(["/a.png"]);
  s.add([]);
  off();
  s.add(["/b.png"]);
  assert.equal(calls, 2);
  assert.equal(s.version(), v0 + 3);
});
