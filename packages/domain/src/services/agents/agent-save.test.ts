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

test("a key the form clears is removed, and so is its alias", () => {
  writeFileSync(join(AGENTS_DIR, "aliased.md"), "---\nname: aliased\ndescription: d\nmodel: opus\nroom: Lab\nextra: 1\n---\n\nb\n");
  writeAgent(bodyFor("aliased", { model: "haiku", room: undefined }));
  const saved = readFileSync(join(AGENTS_DIR, "aliased.md"), "utf8");
  assert.doesNotMatch(saved, /^model:/m, "a stale `model:` would shadow nothing now, but resurface if default-model goes");
  assert.doesNotMatch(saved, /^room:/m);
  assert.match(saved, /^default-model: haiku$/m);
  assert.match(saved, /^extra: 1$/m);
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
