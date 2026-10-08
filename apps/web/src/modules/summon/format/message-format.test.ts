/**
 * imggen writes to `~/Documents/Generated Images/<date>/` — a folder name with a
 * space, which the generic absolute-path pattern splits on.
 *
 *   pnpm exec tsx --test src/modules/summon/format/message-format.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { extractImages, pathToUrl } from "./message-format";

const DIR = "/home/u/Documents/Generated Images/2026-10-08";
const IMG = `${DIR}/09-23-25_fox-logo_7.png`;
const EXPECTED_URL = "/api/generated-images/2026-10-08/09-23-25_fox-logo_7.png";

test("a generated-image path maps to the generated-images route", () => {
  assert.equal(pathToUrl(IMG), EXPECTED_URL);
});

test("extractImages finds a generated image inside prose, space and all", () => {
  assert.deepEqual(extractImages(`Done. Saved to ${IMG}\nLet me know.`), [EXPECTED_URL]);
});

test("markdown and sentence punctuation around the path do not hide the image", () => {
  for (const text of [`Saved to \`${IMG}\`.`, `**${IMG}**`, `Saved: ${IMG}.`, `(${IMG})`]) {
    assert.deepEqual(extractImages(text), [EXPECTED_URL], text);
  }
});

test("extractImages returns every distinct image once, alongside upload paths and urls", () => {
  const other = `${DIR}/09-24-00_cat_8.webp`;
  const text = `${IMG} ${other} ${IMG}\n/home/u/.claude/agents/_uploads/a1/pic.png\nhttps://example.com/x.jpg`;
  assert.deepEqual(extractImages(text), [
    "/api/agents/a1/uploads/pic.png",
    EXPECTED_URL,
    "/api/generated-images/2026-10-08/09-24-00_cat_8.webp",
    "https://example.com/x.jpg",
  ]);
});

test("wrong-shape paths and formats the route refuses are not mapped", () => {
  assert.equal(pathToUrl("/home/u/Documents/Generated Images/x/y.png"), null);
  assert.equal(pathToUrl("/home/u/Documents/Generated Images/notes.png"), null);
  assert.equal(pathToUrl(`${DIR}/sub/a.png`), null);
  assert.equal(pathToUrl(`${DIR}/a.svg`), null);
  assert.deepEqual(extractImages(`${DIR}/a.svg ${DIR}/notes.txt`), []);
});

test("extractImages stays linear on a long slash-only token", () => {
  const start = performance.now();
  extractImages("/".repeat(200_000));
  assert.ok(performance.now() - start < 500);
});

test("a long punctuation run inside a generated-image path stays fast", () => {
  const start = performance.now();
  extractImages(`/Generated Images/2026-01-01/${".".repeat(100_000)}x`);
  assert.ok(performance.now() - start < 500);
});
