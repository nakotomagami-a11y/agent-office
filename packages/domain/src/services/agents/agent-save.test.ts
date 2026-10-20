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
import { createAgent, readAgent, writeAgent } from "./agents";

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

// Second review: escapes inside quotes ended the quote early, so a value Agent Office wrote itself was cut at its `#`.
test('a description with quotes and a # survives a save and a read: Say "hi" #2 fan', () => {
  writeFileSync(join(AGENTS_DIR, "quoted.md"), "---\nname: quoted\ndescription: d\n---\n\nb\n");
  writeAgent(bodyFor("quoted", { desc: 'Say "hi" #2 fan' }));
  assert.equal(readAgent("quoted")!.info.description, 'Say "hi" #2 fan');
});


// The quoted item goes first: an escaped quote that ended the quote early split the list at the next comma.
for (const tools of [['Bash(date +"%h #x")', "Read"], ['Bash(echo ")', "Read"]]) {
  test(`a flow list with escaped quotes round-trips: ${JSON.stringify(tools)}`, () => {
    writeFileSync(join(AGENTS_DIR, "flow.md"), "---\nname: flow\ndescription: d\n---\n\nb\n");
    writeAgent(bodyFor("flow", { tools }));
    assert.deepEqual(readAgent("flow")!.info.tools, tools);
  });
}

test("Windows paths round-trip: a backslash before n or t is not a newline or a tab", () => {
  writeFileSync(join(AGENTS_DIR, "winpath.md"), "---\nname: winpath\ndescription: d\n---\n\nb\n");
  const dirs = ["C:\\Users\\MeiLi\\notes", "D:\\tmp\\new"];
  writeAgent(bodyFor("winpath", { desc: "Reads C:\\notes\\todo", addDirs: dirs }));
  const info = readAgent("winpath")!.info;
  assert.deepEqual(info.addDirs, dirs);
  assert.equal(info.description, "Reads C:\\notes\\todo");
});

test("a save that doesn't change the model leaves a differing CLI model: alone", () => {
  writeFileSync(join(AGENTS_DIR, "both.md"), "---\nname: both\ndescription: d\ndefault-model: sonnet\nmodel: opus\n---\n\nb\n");
  writeAgent(bodyFor("both", { desc: "changed" }));
  assert.match(readFileSync(join(AGENTS_DIR, "both.md"), "utf8"), /^model: opus$/m);
  writeAgent(bodyFor("both", { model: "haiku" }));
  const saved = readFileSync(join(AGENTS_DIR, "both.md"), "utf8");
  assert.match(saved, /^default-model: haiku$/m);
  assert.match(saved, /^model: haiku$/m, "a change the user made reaches the key the CLI reads");
});

test("an empty frontmatter block is a frontmatter block, even with a rule further down", () => {
  writeFileSync(join(AGENTS_DIR, "empty-fm.md"), "---\n---\n\nprompt\n\n---\n\nmore\n");
  assert.equal(readAgent("empty-fm")!.body, "prompt\n\n---\n\nmore");
  assert.ok(writeAgent(bodyFor("empty-fm")).ok);
});

test("an unknown escape keeps its backslash, and \\u / \\x escapes decode", () => {
  writeFileSync(join(AGENTS_DIR, "escapes.md"), '---\nname: escapes\ndescription: "caf\\u00e9 \\x41"\nadd-dirs: ["C:\\Users\\me"]\n---\n\nb\n');
  const info = readAgent("escapes")!.info;
  assert.deepEqual(info.addDirs, ["C:\\Users\\me"], "hand-written C:\\Users\\me lost its backslashes");
  assert.equal(info.description, "caf\u00e9 A");
  writeAgent(bodyFor("escapes"));
  assert.deepEqual(readAgent("escapes")!.info.addDirs, ["C:\\Users\\me"], "a save must not make the loss permanent");
  assert.equal(readAgent("escapes")!.info.description, "caf\u00e9 A");
});
