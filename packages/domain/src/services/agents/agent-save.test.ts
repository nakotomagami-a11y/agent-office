/**
 * Saving an agent used to rebuild its frontmatter from the form's fields, so `add-dirs` and any
 * key the form doesn't know were silently dropped (S1-5); creating one with a taken id overwrote
 * it (S1-6).
 *
 *   pnpm --filter @agent-office/domain test src/services/agents/agent-save.test.ts
 */
import assert from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { AgentBody } from "../../types";
import { AGENTS_DIR } from "../infra/paths";
import { parseYaml } from "../infra/yaml";
import { createAgent, mergeFrontmatter, readAgent, writeAgent } from "./agents";

const FILE = [
  "---",
  "name: keeper",
  "description: Keeps things",
  "default-model: sonnet",
  "default-effort: high",
  "# chosen by hand, do not touch",
  "mcpServers: {playwright: {command: npx}}",
  "skills: [zeta, alpha]",
  "tools: [Read, Bash]",
  "add-dirs:",
  "  - ~/notes",
  "  - ~/shared",
  "permission-mode: plan",
  "color: purple",
  "---",
  "",
  "Body text.",
  "",
].join("\r\n");

function bodyFor(id: string, patch: Partial<AgentBody> = {}): AgentBody {
  const info = readAgent(id)!.info;
  return {
    id,
    name: id,
    desc: info.description,
    skills: info.skills,
    tools: info.tools,
    pm: info.permissionMode ?? "default",
    model: info.defaultModel ?? "sonnet",
    effort: info.defaultEffort ?? "high",
    body: "Body text.",
    panel: info.panel,
    ...patch,
  };
}

test("a save that changes only the model keeps add-dirs, unknown keys, comments and skills order", () => {
  mkdirSync(AGENTS_DIR, { recursive: true });
  const path = join(AGENTS_DIR, "keeper.md");
  writeFileSync(path, FILE);

  writeAgent(bodyFor("keeper", { model: "opus" }));

  const saved = readFileSync(path, "utf8");
  assert.match(saved, /^default-model: opus$/m);
  assert.doesNotMatch(saved, /default-model: sonnet/);
  for (const kept of ["mcpServers: {playwright: {command: npx}}", "# chosen by hand, do not touch", "color: purple", "skills: [zeta, alpha]", "add-dirs:\n  - ~/notes\n  - ~/shared"]) {
    assert.ok(saved.includes(kept), `lost on save: ${kept}`);
  }
  const info = readAgent("keeper")!.info;
  assert.deepEqual(info.addDirs, ["~/notes", "~/shared"]);
  assert.deepEqual(info.skills, ["zeta", "alpha"]);
  assert.equal(info.permissionMode, "plan");
});

test("a key the form clears is removed, and so is our alias of it", () => {
  writeFileSync(join(AGENTS_DIR, "aliased.md"), "---\nname: aliased\ndescription: d\ndisplayName: Old\nroom: Lab\nextra: 1\n---\n\nb\n");
  writeAgent(bodyFor("aliased", { room: undefined }));
  const saved = readFileSync(join(AGENTS_DIR, "aliased.md"), "utf8");
  assert.doesNotMatch(saved, /displayName/, "a stale alias would resurface once display-name is gone");
  assert.doesNotMatch(saved, /^room:/m);
  assert.match(saved, /^extra: 1$/m);
});

test("the CLI's own model: key is kept and follows the form", () => {
  writeFileSync(join(AGENTS_DIR, "native.md"), "---\nname: native\ndescription: d\nmodel: opus\n---\n\nb\n");
  writeAgent(bodyFor("native", { model: "haiku" }));
  const saved = readFileSync(join(AGENTS_DIR, "native.md"), "utf8");
  assert.match(saved, /^model: haiku$/m);
  assert.doesNotMatch(saved, /default-model/);
  writeAgent(bodyFor("native", { model: "default" }));
  const cleared = readFileSync(join(AGENTS_DIR, "native.md"), "utf8");
  assert.doesNotMatch(cleared, /^model:/m, "`model: default` is not a value the CLI takes");
  assert.equal(readAgent("native")!.info.defaultModel, "default");
});

test("addDirs sent by a client replaces the file's add-dirs", () => {
  writeFileSync(join(AGENTS_DIR, "dirs.md"), "---\nname: dirs\ndescription: d\naddDirs: [~/old]\n---\n\nb\n");
  writeAgent(bodyFor("dirs", { addDirs: ["~/new"] }));
  assert.deepEqual(readAgent("dirs")!.info.addDirs, ["~/new"]);
  assert.doesNotMatch(readFileSync(join(AGENTS_DIR, "dirs.md"), "utf8"), /addDirs/);
});

test("creating an agent whose id exists is refused and leaves the file alone", () => {
  const path = join(AGENTS_DIR, "taken.md");
  writeFileSync(path, "---\nname: taken\ndescription: mine\n---\n\nmy prompt\n");
  const before = readFileSync(path, "utf8");
  const result = createAgent({ id: "taken", name: "Taken", desc: "new", skills: [], tools: [], pm: "default", model: "sonnet", effort: "high", body: "theirs" });
  assert.deepEqual(result, { ok: false, error: "agent_exists", status: 409 });
  assert.equal(readFileSync(path, "utf8"), before);
});

test("creating a new agent writes it", () => {
  const result = createAgent({ id: "fresh-one", name: "Fresh One", desc: "new", skills: [], tools: ["Read"], pm: "default", model: "sonnet", effort: "high", body: "hi" });
  assert.deepEqual(result, { ok: true, value: "fresh-one" });
  assert.equal(readAgent("fresh-one")!.info.displayName, "Fresh One");
});

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

test("an inline comment and a quoted key are read the way YAML means them", () => {
  writeFileSync(join(AGENTS_DIR, "commented.md"), '---\nname: commented\ndescription: d\ndefault-model: opus # cheap\n"room": Lab\ncolor: "#fff"\nnotes: |\n  keep # this\n---\n\nb\n');
  const info = readAgent("commented")!.info;
  assert.equal(info.defaultModel, "opus", "the comment reached --model verbatim");
  assert.equal(info.room, "Lab");
});

for (const [label, content] of [
  ["a BOM", "\uFEFF---\nname: bom\ndescription: d\nadd-dirs: [/x]\ncustom: keep\n---\n\nbody\n"],
  ["a closing fence with a trailing space", "---\nname: bom\ndescription: d\nadd-dirs: [/x]\ncustom: keep\n--- \n\nbody\n"],
] as const) {
  test(`a file with ${label} is read and saved without losing keys`, () => {
    writeFileSync(join(AGENTS_DIR, "bom.md"), content);
    assert.deepEqual(readAgent("bom")!.info.addDirs, ["/x"]);
    const result = writeAgent({ id: "bom", name: "bom", desc: "d", body: "body", skills: [], tools: [], pm: "default", model: "sonnet", effort: "high" });
    assert.ok(result.ok);
    const saved = readFileSync(join(AGENTS_DIR, "bom.md"), "utf8");
    assert.match(saved, /^add-dirs: \[\/x\]$/m);
    assert.match(saved, /^custom: keep$/m);
  });
}

test("a frontmatter block that never closes is refused, not overwritten", () => {
  const path = join(AGENTS_DIR, "open.md");
  writeFileSync(path, "---\nname: open\ncustom: keep\n\nbody without a closing fence\n");
  const result = writeAgent({ id: "open", name: "open", desc: "d", body: "b", skills: [], tools: [], pm: "default", model: "sonnet", effort: "high" });
  assert.deepEqual(result, { ok: false, error: "frontmatter_unparseable", status: 422 });
  assert.match(readFileSync(path, "utf8"), /custom: keep/);
});
