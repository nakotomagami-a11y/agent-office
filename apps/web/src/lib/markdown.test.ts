/**
 * Streaming is the hard case for the prose splitter: a chat message is re-split
 * from scratch on every SSE delta, so EVERY prefix of a message has to look
 * sane — not just the final text. These tests therefore replay prefixes, which
 * is the only way the original bug was visible at all.
 *
 * The reported symptom was the bare word "bash" appearing mid-sentence with the
 * sentence then carrying on. Cause: `splitProse` only matched a fence that had
 * a CLOSING ```, which a streaming fence does not have for most of its life, so
 * it fell through to prose. `ProseBlock` joins prose lines with a space, gluing
 * "```bash" to the sentence before it and the command to that; then the instant
 * the closer's first backtick arrived, `inlineMd`'s `([^`]+)` paired it with the
 * opening fence and rendered everything between as one inline-code run reading
 * "bash pnpm typecheck".
 *
 * So the three invariants below are the actual fix, and each guards a frame that
 * used to render wrong:
 *   - no prose line may contain two backticks (the fence must never be prose),
 *   - a fence's lang never renders half-streamed (no b → ba → bash in the
 *     block header, i.e. don't open the block until its fence line is complete),
 *   - the body only grows (the closer's partial backticks must not land in it).
 *
 *   pnpm --filter @agent-office/web test
 */
import assert from "node:assert";
import { test } from "node:test";
import { splitProse, type ProseItem } from "./markdown";

/** The prose lines a prefix renders, i.e. everything NOT in a code block. */
const proseOf = (text: string): string[] =>
  splitProse(text).filter((i): i is string => typeof i === "string");

const codeOf = (text: string): Array<Extract<ProseItem, { type: "code" }>> =>
  splitProse(text).filter((i): i is Extract<ProseItem, { type: "code" }> =>
    typeof i === "object" && i.type === "code");

const MESSAGES = [
  "Let me check the config file:\n```bash\ncat package.json\n```\nDone.",
  "I updated `apps/web` — now run:\n```bash\npnpm typecheck\npnpm lint\n```\nIt passes.",
  "Two blocks:\n\n```ts\nconst a = 1;\n```\n\nand\n\n```bash\nls -la\n```\n\nthat's it.",
];

test("no prefix of a streaming message leaks fence backticks into prose", () => {
  for (const full of MESSAGES) {
    for (let i = 1; i <= full.length; i++) {
      const prefix = full.slice(0, i);
      for (const line of proseOf(prefix)) {
        assert.ok(
          !line.includes("``"),
          `leaked fence at prefix ${i} of ${JSON.stringify(full.slice(0, 30))}: ${JSON.stringify(line)}`,
        );
      }
    }
  }
});

test("a fence's lang never renders half-streamed", () => {
  const full = MESSAGES[1]!;
  const langs = new Set<string>();
  for (let i = 1; i <= full.length; i++) {
    for (const block of codeOf(full.slice(0, i))) langs.add(block.lang);
  }
  assert.deepEqual([...langs], ["bash"]);
});

test("an open fence's body grows monotonically — never shrinks mid-stream", () => {
  const full = MESSAGES[1]!;
  let longest = "";
  for (let i = 1; i <= full.length; i++) {
    const body = codeOf(full.slice(0, i))[0]?.body;
    if (body === undefined) continue;
    assert.ok(
      body.startsWith(longest),
      `body went backwards at prefix ${i}: ${JSON.stringify(body)} after ${JSON.stringify(longest)}`,
    );
    longest = body;
  }
  assert.equal(longest, "pnpm typecheck\npnpm lint");
});

// The blank line each code item is flanked by is pre-existing behaviour (the
// newline before the fence ends a prose line); `ProseBlock` treats it as a
// paragraph flush, so it renders nothing of its own.
test("an unclosed fence in finished text renders as a code block (CommonMark)", () => {
  const items = splitProse("Here:\n```bash\nls -la");
  assert.deepEqual(items, ["Here:", "", { type: "code", lang: "bash", body: "ls -la" }]);
});

test("closed fences, tables and plain prose are unchanged", () => {
  assert.deepEqual(splitProse("a\n```ts\nx\n```\nb"), [
    "a",
    "",
    { type: "code", lang: "ts", body: "x" },
    "",
    "b",
  ]);
  assert.deepEqual(splitProse("just prose\nover two lines"), ["just prose", "over two lines"]);
  assert.deepEqual(splitProse("| a | b |\n| --- | --- |\n| 1 | 2 |"), [
    { type: "table", header: ["a", "b"], align: [null, null], rows: [["1", "2"]] },
  ]);
});

test("inline code spans are left to the inline renderer", () => {
  assert.deepEqual(splitProse("run `pnpm dev` first"), ["run `pnpm dev` first"]);
  assert.deepEqual(splitProse("a ``double`` span"), ["a ``double`` span"]);
});
