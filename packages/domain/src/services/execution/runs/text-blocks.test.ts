/**
 * A turn's text blocks are saved as separate paragraphs where a tool call split them, and glued
 * where the CLI just continued one.
 *
 *   pnpm --filter @agent-office/domain test src/services/execution/runs/text-blocks.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { noteToolCall, startTextBlock, textBlockSeparator, type SavedOutput } from "./text-blocks";

function run(): SavedOutput {
  return { output: "", toolSinceText: false };
}

function text(r: SavedOutput, s: string): void {
  startTextBlock(r);
  r.output += s;
}

test("text, a tool call, text: two paragraphs", () => {
  const r = run();
  text(r, "First, the conventions?");
  noteToolCall(r);
  text(r, "The ceiling…");
  assert.equal(r.output, "First, the conventions?\n\nThe ceiling…");
});

test("a block that continues the last one (no tool call between) is glued as it streamed", () => {
  const r = run();
  text(r, "| a | b |\n| -- | -- |\n| the conf");
  text(r, "iguration | x |");
  assert.equal(r.output, "| a | b |\n| -- | -- |\n| the configuration | x |");
});

test("tool calls before any text, or several in a row, add one break at most", () => {
  const r = run();
  noteToolCall(r);
  text(r, "Looking.");
  noteToolCall(r);
  noteToolCall(r);
  text(r, "Found it.");
  assert.equal(r.output, "Looking.\n\nFound it.");
});

test("no extra blank lines after text that already ends a paragraph", () => {
  assert.equal(textBlockSeparator(""), "");
  assert.equal(textBlockSeparator("done.\n\n"), "");
  assert.equal(textBlockSeparator("a list\n- item\n"), "\n");
});
