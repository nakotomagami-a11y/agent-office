/**
 * Editing an agent must change only its own file, and keep its prompt history honest; deleting
 * one must leave a copy of everything it removes.
 *
 *   pnpm --filter @agent-office/domain test src/services/agents/agent-update-delete.test.ts
 */
import assert from "node:assert";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { AGENTS_DIR, AGENT_BACKUPS_DIR } from "../infra/paths";
import { deleteAgent, listAgentBodyHistory, readAgent, updateAgent, type AgentPatch } from "./agents";

const before = new Set(existsSync(AGENTS_DIR) ? readdirSync(AGENTS_DIR) : []);
after(() => {
  for (const f of readdirSync(AGENTS_DIR)) if (!before.has(f)) rmSync(join(AGENTS_DIR, f), { force: true });
});

const edit = (id: string, patch: AgentPatch = {}) =>
  updateAgent(id, { name: id, desc: "d", skills: [], tools: [], pm: "default", model: "sonnet", effort: "high", body: "prompt", ...patch });

function agentFile(id: string, content = `---\nname: ${id}\ndescription: d\n---\n\nprompt\n`): string {
  mkdirSync(AGENTS_DIR, { recursive: true });
  const path = join(AGENTS_DIR, `${id}.md`);
  writeFileSync(path, content);
  return path;
}

test("updating an id with no file is a 404 and creates nothing", () => {
  assert.deepEqual(edit("nobody-here"), { ok: false, error: "not_found", status: 404 });
  assert.equal(existsSync(join(AGENTS_DIR, "nobody-here.md")), false);
});

test("a save that leaves the body alone takes no snapshot, so it cannot evict a real one", () => {
  agentFile("steady");
  for (const model of ["opus", "haiku", "sonnet"]) assert.ok(edit("steady", { model }).ok);
  assert.deepEqual(listAgentBodyHistory("steady"), []);
});

test("a changed body snapshots the previous one", () => {
  agentFile("changing");
  assert.ok(edit("changing", { body: "new prompt" }).ok);
  const [snap] = listAgentBodyHistory("changing");
  assert.ok(snap);
  assert.equal(readFileSync(join(AGENTS_DIR, snap.filename), "utf8"), "prompt");
  assert.equal(readAgent("changing")!.body, "new prompt");
});

test("a refused write takes no snapshot", () => {
  agentFile("unclosed", "---\nname: unclosed\ndescription: d\n\nprompt\n");
  assert.equal(edit("unclosed", { body: "other" }).ok, false);
  assert.deepEqual(listAgentBodyHistory("unclosed"), []);
});

test("a partial update changes only the keys it carries", () => {
  // The schema's defaults turned `{ name, model }` into an empty prompt, no tools and default permissions.
  const path = agentFile("partial", "---\nname: partial\ndescription: keep me\ntools: [Read, Bash]\nskills: [alpha]\npermission-mode: plan\nroom: Lab\n---\n\nmy prompt\n");
  assert.ok(updateAgent("partial", { name: "partial", model: "opus" }).ok);
  const info = readAgent("partial")!;
  assert.equal(info.body, "my prompt");
  assert.deepEqual(info.info.tools, ["Read", "Bash"]);
  assert.deepEqual(info.info.skills, ["alpha"]);
  assert.equal(info.info.permissionMode, "plan");
  assert.equal(info.info.room, "Lab");
  assert.equal(info.info.description, "keep me");
  assert.match(readFileSync(path, "utf8"), /^default-model: opus$/m);
  assert.deepEqual(listAgentBodyHistory("partial"), []);
});

test("an empty room or unit clears it", () => {
  agentFile("roomy", "---\nname: roomy\ndescription: d\nroom: Lab\nunit: elf/mage\n---\n\np\n");
  assert.ok(updateAgent("roomy", { room: "", unit: "" }).ok);
  assert.equal(readAgent("roomy")!.info.room, undefined);
  assert.equal(readAgent("roomy")!.info.unit, undefined);
});

test("a save keeps the frontmatter name the CLI knows the agent by", () => {
  const path = agentFile("qa_bot", "---\nname: Reviewer\ndescription: d\n---\n\nprompt\n");
  assert.ok(edit("qa_bot", { name: "Reviewer", model: "opus" }).ok);
  const saved = readFileSync(path, "utf8");
  assert.match(saved, /^name: Reviewer$/m);
  assert.doesNotMatch(saved, /display-name/);
  assert.equal(readAgent("qa_bot")!.info.id, "qa_bot");
  assert.equal(existsSync(join(AGENTS_DIR, "reviewer.md")), false);
});

test("deleting an agent copies its file, memory and identity to the backups folder first", () => {
  agentFile("leaving");
  writeFileSync(join(AGENTS_DIR, "leaving.memory.md"), "learned things");
  writeFileSync(join(AGENTS_DIR, "leaving.identity.md"), "who I am");

  assert.equal(deleteAgent("leaving"), true);

  for (const f of ["leaving.md", "leaving.memory.md", "leaving.identity.md"]) assert.equal(existsSync(join(AGENTS_DIR, f)), false, f);
  const backups = readdirSync(AGENT_BACKUPS_DIR).filter((f) => f.startsWith("leaving.deleted-"));
  const read = (ext: string) => {
    const name = backups.find((f) => new RegExp(`^leaving\\.deleted-[^.]+\\.${ext}$`).test(f));
    assert.ok(name, ext);
    return readFileSync(join(AGENT_BACKUPS_DIR, name), "utf8");
  };
  assert.equal(backups.length, 3);
  assert.match(read("md"), /^---\nname: leaving/);
  assert.equal(read("memory\\.md"), "learned things");
  assert.equal(read("identity\\.md"), "who I am");
});
