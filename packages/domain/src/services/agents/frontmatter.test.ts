/**
 * Saving into frontmatter we don't fully own: each case below lost a line, kept a removed tool,
 * duplicated a key or cut a value at its `#` in an earlier version (S1-5).
 *
 *   pnpm --filter @agent-office/domain test src/services/agents/frontmatter.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { parseYaml } from "../infra/yaml";
import { mergeFrontmatter, stripInlineComments } from "./frontmatter";

// The reviewer's probes of the first version: each one lost a line, kept a removed tool, or duplicated a key.
const probes: Array<[string, string, Record<string, unknown>, (out: string) => void]> = [
  ["a quoted key with a colon is its own entry, never glued to an owned one", 'description: old\n"x:y": keep-me\nfoo: bar', { description: "new" },
    (out) => assert.equal(out, 'description: new\n"x:y": keep-me\nfoo: bar')],
  ["a commented-out list item inside a rewritten entry is kept", "tools:\n  - Read\n  # - Bash  disabled\nskills: []", { tools: ["Read", "Write"] },
    (out) => {
      assert.ok(out.includes("# - Bash  disabled"));
      assert.deepEqual((parseYaml(out) as Record<string, unknown>).tools, ["Read", "Write"]);
      assert.match(out, /^skills: \[\]$/m);
    }],
  ["a column-0 comment inside a list does not leave a removed tool granted", "tools:\n  - Read\n# legacy\n  - Bash\nfoo: 1", { tools: ["Read"] },
    (out) => {
      assert.deepEqual((parseYaml(out) as Record<string, unknown>).tools, ["Read"]);
      assert.ok(out.includes("# legacy"));
    }],
  ["a quoted owned key is rewritten, not duplicated", '"room": a\nname: x', { room: "c", name: "x" },
    (out) => assert.deepEqual(out.split("\n").filter((l) => /^"?room"?:/.test(l)), ["room: c"])],
  ["an inline comment on an unchanged value is kept byte for byte", "default-model: opus # cheap", { "default-model": "opus" },
    (out) => assert.equal(out, "default-model: opus # cheap")],
  ["the CLI's model: is not dropped for default-model", "name: a\nmodel: haiku\nx-custom: 1", { name: "a", "default-model": "haiku" },
    (out) => assert.equal(out, "name: a\nmodel: haiku\nx-custom: 1")],
  ["a block scalar's colon and dash lines stay inside it", "notes: |\n  line: with colon\n  - dash\nname: a", { name: "b" },
    (out) => assert.equal(out, "notes: |\n  line: with colon\n  - dash\nname: b")],
  ["a list of mappings at column 0 stays with its key", "hooks:\n- a: 1\n  b: 2\nname: a", { name: "b" },
    (out) => assert.equal(out, "hooks:\n- a: 1\n  b: 2\nname: b")],
  ["a duplicated owned key collapses to one", "room: a\nroom: b", { room: "c" }, (out) => assert.equal(out, "room: c")],
  ["a space before the colon is still the key", "room : a\nname: x", { room: "c", name: "x" }, (out) => assert.equal(out, "room: c\nname: x")],
  ["an unchanged folded scalar is kept as written", "description: >\n  folded\n  text\nname: a", { description: "folded text" },
    (out) => assert.equal(out, "description: >\n  folded\n  text\nname: a")],
];
for (const [name, input, owned, check] of probes) {
  test(`mergeFrontmatter: ${name}`, () => check(mergeFrontmatter(input, owned as never)));
}

test("stripInlineComments honours \\\" and '' escapes", () => {
  assert.equal(stripInlineComments('x: "a \\"b\\" #c"'), 'x: "a \\"b\\" #c"');
  assert.equal(stripInlineComments("x: 'it''s #1' # c"), "x: 'it''s #1'");
});
