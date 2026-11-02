/**
 * Title/description inherited from the repo's own committed files, so a second
 * device sees what the first one sees without retyping it.
 * Runs against a throwaway $HOME sandbox — never touches real project data.
 *
 *   pnpm --filter @agent-office/domain test src/services/projects/projects.repo-identity.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point $HOME at a sandbox BEFORE importing anything that reads paths.ts.
const sandbox = mkdtempSync(join(tmpdir(), "ao-repoid-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;

const claudeDir = join(sandbox, ".claude");
const projectsDir = join(claudeDir, "projects");
const projectsRoot = join(sandbox, "root");
mkdirSync(projectsDir, { recursive: true });
writeFileSync(
  join(claudeDir, "agent-office-settings.json"),
  JSON.stringify({ projectsRoot, excluded: [], firstRunComplete: true }),
);

function repo(folder: string, files: Record<string, string>): string {
  const dir = join(projectsRoot, folder);
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

function localMeta(folder: string, frontmatter: string): void {
  const dir = join(projectsDir, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "project.md"), `---\n${frontmatter}\n---\n`);
}

repo("inherits", { "package.json": JSON.stringify({ name: "inherits", displayName: "Shared Title", description: "Shared description" }) });
repo("ao-wins", { ".ao.json": JSON.stringify({ name: "Ao Title", description: "Ao description" }) });
repo("local-wins", { "package.json": JSON.stringify({ displayName: "Repo Title", description: "Repo description" }) });
localMeta("local-wins", 'name: "Typed Title"\ndescription: "Typed description"');
repo("slug-name", { "package.json": JSON.stringify({ displayName: "Repo Title", description: "Repo description" }) });
localMeta("slug-name", "name: slug-name");
repo("bare", { "package.json": JSON.stringify({ name: "bare" }) });
repo("launder", { ".ao.json": JSON.stringify({ name: "Repo Authored", description: "Repo authored description" }) });

const projects = await import("./projects");
const save = await import("./save");

const byId = new Map(projects.listProjectSummaries().map((p) => [p.id, p]));
const summary = (id: string) => {
  const s = byId.get(id);
  assert.ok(s, `missing project ${id} (${[...byId.keys()].join(", ")})`);
  return s;
};

test("package.json displayName and description show with no local metadata", () => {
  assert.strictEqual(summary("inherits").name, "Shared Title");
  assert.strictEqual(summary("inherits").description, "Shared description");
});

test(".ao.json supplies identity for a repo with no package.json", () => {
  assert.strictEqual(summary("ao-wins").name, "Ao Title");
  assert.strictEqual(summary("ao-wins").description, "Ao description");
});

test("local project.md overrides the repo", () => {
  assert.strictEqual(summary("local-wins").name, "Typed Title");
  assert.strictEqual(summary("local-wins").description, "Typed description");
});

// Earlier writes persisted the folder name as `name:`; treating that as a
// choice would mask the repo's title on every project that has one.
test("a persisted folder-name does not mask the repo title", () => {
  assert.strictEqual(summary("slug-name").name, "Repo Title");
  assert.strictEqual(summary("slug-name").description, "Repo description");
});

test("a repo declaring nothing still falls back to the folder name", () => {
  assert.strictEqual(summary("bare").name, "bare");
  assert.strictEqual(summary("bare").description, "");
});

// Clearing the local description in the UI writes no `description:` key, which
// is what makes the repo value come back.
test("clearing the local description restores the inherited one", () => {
  const before = projects.readProject("local-wins");
  projects.updateProject("local-wins", { meta: { description: "" }, expectedRev: before!.rev }, "test");
  assert.strictEqual(projects.readProject("local-wins")!.meta.description, "Repo description");
});

// An unrelated write used to seed its merge base from the RESOLVED view, so
// shelving a project copied the repo's text into this device's project.md and
// froze it there — inherited text laundered into the trusted local store.
test("an unrelated write does not persist the inherited identity", () => {
  assert.strictEqual(projects.readProject("launder")!.meta.name, "Repo Authored");
  projects.updateProject("launder", { meta: { shelved: true } }, "test");

  const onDisk = readFileSync(join(projectsDir, "launder", "project.md"), "utf8");
  assert.doesNotMatch(onDisk, /^name:/m, onDisk);
  assert.doesNotMatch(onDisk, /^description:/m, onDisk);
  assert.match(onDisk, /^shelved: true$/m, onDisk);

  writeFileSync(
    join(projectsRoot, "launder", ".ao.json"),
    JSON.stringify({ name: "Renamed By Teammate", description: "Renamed description" }),
  );
  const after = projects.readProject("launder")!;
  assert.strictEqual(after.meta.name, "Renamed By Teammate");
  assert.strictEqual(after.meta.description, "Renamed description");
  assert.strictEqual(after.meta.shelved, true);
});

// An export carried the RESOLVED name, so an import on the next device wrote it
// back as a local override — the inherited title pinned by a round trip, and
// every automatic pre-import backup bundle poisoned the same way.
test("an export/import round trip does not pin the inherited identity", () => {
  const bundle = save.exportBundle("launder");
  assert.ok(bundle);
  assert.strictEqual(bundle.project.meta.name, "");
  assert.strictEqual(bundle.project.meta.description, "");

  const { id, meta, memory } = bundle.project;
  save.importBundle({ ...bundle, project: { id, meta: { ...meta, roster: meta.roster }, memory } });
  const onDisk = readFileSync(join(projectsDir, "launder", "project.md"), "utf8");
  assert.doesNotMatch(onDisk, /^name:/m, onDisk);
  assert.doesNotMatch(onDisk, /^description:/m, onDisk);
  assert.strictEqual(projects.readProject("launder")!.meta.name, "Renamed By Teammate");
});
