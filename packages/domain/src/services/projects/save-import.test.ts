/**
 * Importing a save file overwrote agent files and memory with no backup, replaced the roster
 * (orphaning worktrees, bringing in another machine's paths) and replaced the global office
 * layout without asking (S4-7, S1-12).
 *
 *   pnpm --filter @agent-office/domain test src/services/projects/save-import.test.ts
 */
import assert from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// $HOME must point at a sandbox BEFORE importing anything that resolves paths.
const sandbox = mkdtempSync(join(tmpdir(), "ao-save-import-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;
const projectsRoot = join(sandbox, "root");
mkdirSync(join(projectsRoot, "imp"), { recursive: true });
mkdirSync(join(sandbox, ".claude"), { recursive: true });
writeFileSync(join(sandbox, ".claude", "agent-office-settings.json"), JSON.stringify({ projectsRoot, excluded: [], firstRunComplete: true }));

const { AGENTS_DIR, AGENT_BACKUPS_DIR, IMPORT_BACKUPS_DIR } = await import("../infra/paths");
const projects = await import("./projects");
const db = await import("../db");
const save = await import("./save");
const { OFFICE_SETTING_KEYS } = await import("../../config/office");

const office = { grid: "imported-grid", decorations: null, agents: null, grassColor: null };

function bundle(roster: unknown[]) {
  return {
    project: { id: "imp", meta: { name: "Imported", roster }, memory: "imported memory" },
    agents: [{ id: "imp-dev", content: "---\nname: imp-dev\ndescription: theirs\n---\n\ntheirs\n", memory: "" }],
    office,
  };
}

test("import backs up what it replaces, keeps the local roster, strips machine paths, leaves the office alone", () => {
  mkdirSync(AGENTS_DIR, { recursive: true });
  writeFileSync(join(AGENTS_DIR, "imp-dev.md"), "---\nname: imp-dev\ndescription: mine\n---\n\nmine\n");
  writeFileSync(join(AGENTS_DIR, "imp-dev.memory.md"), "my memory");
  projects.createProject({ id: "imp", name: "Local" });
  projects.replaceRoster("imp", [{ instanceId: "imp-dev-local", agentId: "imp-dev" }]);
  db.setUiSetting(OFFICE_SETTING_KEYS.grid, "my-grid");

  const out = save.importBundle(bundle([
    { instanceId: "imp-dev-local", agentId: "imp-dev", cwd: "/elsewhere" },
    { instanceId: "imp-dev-remote", agentId: "imp-dev", cwd: "C:\\Users\\them\\proj", worktree: { branch: "agent/x", basePath: "/them/.worktrees/x", createdAt: 1 } },
  ]));

  assert.deepEqual(out.backedUp, ["imp-dev"]);
  const backup = readdirSync(AGENT_BACKUPS_DIR).find((f) => f.startsWith("imp-dev.import-"));
  assert.ok(backup, "the replaced agent file must be backed up");
  assert.match(readFileSync(join(AGENT_BACKUPS_DIR, backup), "utf8"), /mine/);
  assert.equal(readFileSync(join(AGENTS_DIR, "imp-dev.memory.md"), "utf8"), "my memory", "an empty imported memory erases nothing");

  const roster = projects.readProject("imp")!.meta.roster;
  assert.deepEqual(roster.map((r) => r.instanceId), ["imp-dev-local", "imp-dev-remote"]);
  assert.equal(roster[0]!.cwd, undefined, "the local seat is kept as it was");
  assert.equal(roster[1]!.cwd, undefined);
  assert.equal(roster[1]!.worktree, undefined);

  assert.equal(out.officeRestored, false);
  assert.equal(db.getAllUiSettings()[OFFICE_SETTING_KEYS.grid], "my-grid");

  assert.ok(out.snapshot && existsSync(out.snapshot));
  assert.ok(out.snapshot.startsWith(IMPORT_BACKUPS_DIR));
  assert.match(readFileSync(out.snapshot, "utf8"), /imp-dev-local/);
});

test("the office layout is replaced only when asked", () => {
  const out = save.importBundle(bundle([]), { restoreOffice: true });
  assert.equal(out.officeRestored, true);
  assert.equal(db.getAllUiSettings()[OFFICE_SETTING_KEYS.grid], "imported-grid");
});
