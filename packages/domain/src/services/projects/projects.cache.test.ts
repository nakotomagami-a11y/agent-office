/**
 * Focused regression test for the readMetadata mtime cache (Fix #3).
 * Runs against a throwaway $HOME sandbox — never touches real project data.
 *
 *   npx tsx packages/domain/src/services/projects/projects.cache.test.ts
 */
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point $HOME at a sandbox BEFORE importing anything that reads paths.ts
// (CLAUDE_DIR/PROJECTS_DIR/DB_PATH are computed from homedir() at import time).
const sandbox = mkdtempSync(join(tmpdir(), "ao-projcache-"));
process.env.HOME = sandbox;

const claudeDir = join(sandbox, ".claude");
const projectsDir = join(claudeDir, "projects");
const projectsRoot = join(sandbox, "root");
mkdirSync(projectsDir, { recursive: true });
mkdirSync(join(projectsRoot, "myproj"), { recursive: true });
writeFileSync(
  join(claudeDir, "agent-office-settings.json"),
  JSON.stringify({ projectsRoot, excluded: [], firstRunComplete: true }),
);

const projects = await import("./projects");
const { slugify } = await import("../settings");
const id = slugify("myproj");
const metaPath = join(projectsDir, id, "project.md");
mkdirSync(join(projectsDir, id), { recursive: true });

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS  ${name}`);
}

// Seed initial metadata.
writeFileSync(metaPath, "---\nname: Original Name\ndescription: first\n---\n");

check("first read reflects on-disk metadata", () => {
  const list = projects.listProjectSummaries();
  const p = list.find((x) => x.id === id);
  assert.ok(p, "project scanned");
  assert.equal(p!.name, "Original Name");
  assert.equal(p!.description, "first");
});

check("repeated read is stable (cache hit path)", () => {
  const a = projects.listProjectSummaries().find((x) => x.id === id)!;
  const b = projects.listProjectSummaries().find((x) => x.id === id)!;
  assert.equal(a.name, b.name);
  assert.equal(b.description, "first");
});

check("writeMetadata (updateProject) invalidates cache — new value read back", () => {
  projects.updateProject(id, { meta: { description: "changed via api" } });
  const p = projects.readProject(id)!;
  assert.equal(p.meta.description, "changed via api");
});

check("out-of-band file edit with newer mtime is picked up", () => {
  writeFileSync(metaPath, "---\nname: Edited Externally\ndescription: second\n---\n");
  // Guarantee a strictly-newer mtime so the change can't be masked by
  // same-millisecond mtimeMs collisions on fast filesystems.
  const future = Date.now() / 1000 + 5;
  utimesSync(metaPath, future, future);
  const p = projects.readProject(id)!;
  assert.equal(p.meta.name, "Edited Externally");
  assert.equal(p.meta.description, "second");
});

check("missing metadata falls back to folder name (negative cache path)", () => {
  mkdirSync(join(projectsRoot, "bare"), { recursive: true });
  const bareId = slugify("bare");
  const p1 = projects.listProjectSummaries().find((x) => x.id === bareId)!;
  const p2 = projects.listProjectSummaries().find((x) => x.id === bareId)!;
  assert.equal(p1.name, "bare");
  assert.equal(p2.name, "bare"); // second call hits negative cache, still correct
});

// Sanity: the metadata file we edited externally is what's on disk.
assert.match(readFileSync(metaPath, "utf8"), /Edited Externally/);

console.log(`\n${passed} passed`);
