/**
 * "Delete folder" acts on the folder the user confirmed, or on nothing.
 *
 * Two shipped failures: on Windows a `~/` projects root made every delete refuse
 * (`startsWith(root + "/")` against a mixed-separator path), and the server
 * resolved the bare slug under the SAVED root while the pane listed an unsaved
 * one, so the confirmed path and the deleted path could differ. Two folder names
 * that slugify alike (`My App`, `my-app`) collided the same way.
 *
 *   pnpm --filter @agent-office/domain test src/services/projects/projects.remove-folder.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sandbox = mkdtempSync(join(tmpdir(), "ao-rmfolder-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox; // os.homedir() reads this on Windows, not HOME

const claudeDir = join(sandbox, ".claude");
const settingsFile = join(claudeDir, "agent-office-settings.json");
mkdirSync(join(claudeDir, "projects"), { recursive: true });

function saveRoot(projectsRoot: string): void {
  writeFileSync(settingsFile, JSON.stringify({ projectsRoot, excluded: [], firstRunComplete: true }));
}

function folder(...parts: string[]): string {
  const p = join(sandbox, ...parts);
  mkdirSync(p, { recursive: true });
  writeFileSync(join(p, "work.txt"), "precious");
  return p;
}

function metadata(id: string): string {
  const dir = join(claudeDir, "projects", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "project.md"), "---\nname: x\n---\n");
  return dir;
}

const projects = await import("./projects");

test("a `~/` root deletes the confirmed folder and its metadata", () => {
  saveRoot("~/tilde-root");
  const target = folder("tilde-root", "alpha");
  const meta = metadata("alpha");

  assert.equal(projects.removeProjectFolder("alpha", target), true);
  assert.equal(existsSync(target), false);
  assert.equal(existsSync(meta), false);
});

test("a path under another root (the unsaved one the pane showed) deletes nothing", () => {
  saveRoot(join(sandbox, "saved-root"));
  const saved = folder("saved-root", "beta");
  const shown = folder("edited-root", "beta");

  assert.equal(projects.removeProjectFolder("beta", shown), false);
  assert.equal(existsSync(saved), true, "the saved root's same-named folder must survive");
  assert.equal(existsSync(shown), true);
});

test("a path that is not the folder `id` names deletes nothing", () => {
  saveRoot(join(sandbox, "mismatch-root"));
  const gamma = folder("mismatch-root", "gamma");
  const delta = folder("mismatch-root", "delta");

  assert.equal(projects.removeProjectFolder("gamma", delta), false);
  assert.equal(existsSync(gamma), true);
  assert.equal(existsSync(delta), true);
});

test("two folders sharing a slug: only the confirmed one goes, the shared metadata stays", () => {
  saveRoot(join(sandbox, "slug-root"));
  const spaced = folder("slug-root", "My App");
  const dashed = folder("slug-root", "my-app");
  const meta = metadata("my-app");

  assert.equal(projects.removeProjectFolder("my-app", spaced), true);
  assert.equal(existsSync(spaced), false);
  assert.equal(existsSync(dashed), true, "the sibling with the same slug was the wrong folder");
  assert.equal(existsSync(meta), true, "the sibling still owns the metadata");
});
