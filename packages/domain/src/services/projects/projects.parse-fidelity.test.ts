/**
 * Parse fidelity for project.md: a write must never destroy what the reader
 * could not understand.
 *
 * Every case here was REPRODUCED as live data loss before being fixed — a
 * CRLF file losing its whole frontmatter to one shelve toggle, unknown keys
 * being dropped, and planet palettes silently disappearing because the YAML
 * layer could not round-trip a nested array.
 *
 *   pnpm --filter @agent-office/domain test
 */
import assert from "node:assert";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// $HOME must point at a sandbox BEFORE importing anything that resolves paths.
const sandbox = mkdtempSync(join(tmpdir(), "ao-projparse-"));
process.env.HOME = sandbox;

const claudeDir = join(sandbox, ".claude");
const projectsDir = join(claudeDir, "projects");
const projectsRoot = join(sandbox, "root");
mkdirSync(projectsDir, { recursive: true });
mkdirSync(join(projectsRoot, "proj"), { recursive: true });
writeFileSync(
  join(claudeDir, "agent-office-settings.json"),
  JSON.stringify({ projectsRoot, excluded: [], firstRunComplete: true }),
);

const projects = await import("./projects");
const id = "proj";
const metaPath = join(projectsDir, id, "project.md");
mkdirSync(join(projectsDir, id), { recursive: true });

const SEED = `---
name: "Seeded"
roster:
- instanceId: developer-aaa
  agentId: developer
- instanceId: developer-bbb
  agentId: developer
accountId: acc_keepme
githubAccountId: gh_keepme
---
`;

/** Reset to a known file, with a strictly-newer mtime so no cache can mask it. */
function reseed(content = SEED): void {
  writeFileSync(metaPath, content);
  const future = Date.now() / 1000 + 5;
  utimesSync(metaPath, future, future);
}

// --- parse fidelity: a write must never destroy what it could not read ------
// Every case below was REPRODUCED as live data loss before being fixed.

test("a CRLF project.md survives a write", () => {
  // A hand-rolled /^---\n/ regex matched nothing on CRLF, so the whole
  // frontmatter was swallowed as body and the next write emitted an empty
  // project: roster, accountId and name all gone from one shelve toggle.
  writeFileSync(metaPath, SEED.split("\n").join("\r\n"));
  const future = Date.now() / 1000 + 5;
  utimesSync(metaPath, future, future);

  projects.updateProject(id, { meta: { shelved: true } });
  const p = projects.readProject(id)!;
  assert.equal(p.meta.name, "Seeded");
  assert.equal(p.meta.accountId, "acc_keepme");
  assert.deepEqual(p.meta.roster.map((i) => i.instanceId), ["developer-aaa", "developer-bbb"]);
});

test("frontmatter keys this module does not model are carried through", () => {
  reseed(SEED.replace("accountId: acc_keepme", "notes: do not lose me\naccountId: acc_keepme"));
  projects.updateProject(id, { meta: { shelved: true } });
  assert.match(readFileSync(metaPath, "utf8"), /notes: "?do not lose me"?/);
  assert.equal(projects.readProject(id)!.meta.accountId, "acc_keepme");
});

test("a present-but-unreadable project.md is refused, not overwritten", () => {
  // Frontmatter block present, but it is a sequence rather than a mapping, so
  // it yields nothing. Writing on top would use an EMPTY merge base and delete
  // whatever is really in the file — and the rev check would not save us,
  // because the rev hashes raw bytes that read back fine.
  reseed("---\n- just\n- a list\n---\n");
  const before = readFileSync(metaPath, "utf8");
  assert.throws(() => projects.updateProject(id, { meta: { shelved: true } }), /unreadable/i);
  assert.equal(readFileSync(metaPath, "utf8"), before, "refused write must not touch the file");
});

test("every PlanetConfig field survives serialize -> parse", () => {
  reseed();
  // Derived from the fixture's own keys so a newly added planet field cannot
  // be silently forgotten by the serializer (customPalette already was).
  const planet = {
    type: "islands" as const, seed: 42, paletteIdx: 1, pixels: 800,
    rotation: 0.25, dither: false, params: { a: 1 },
    customPalette: [[[1, 2, 3] as [number, number, number]]],
  };
  projects.updateProject(id, { meta: { planet } });
  const got = projects.readProject(id)!.meta.planet as unknown as Record<string, unknown>;
  for (const k of Object.keys(planet)) {
    assert.ok(k in got, `planet.${k} was dropped by serializeMetadata`);
  }
  assert.deepEqual(got.customPalette, planet.customPalette);
});

test("replaceRoster refuses a non-array instead of emptying the roster", () => {
  reseed();
  assert.throws(() => projects.replaceRoster(id, undefined), /requires an array/);
  assert.equal(projects.readProject(id)!.meta.roster.length, 2, "roster untouched");
});

// --- bundle import must not empty a live roster -----------------------------

// All null so restoreOffice's `if (value != null)` skips the DB entirely —
// this test is about the roster, not office settings.
const EMPTY_OFFICE = { grid: null, decorations: null, agents: null, grassColor: null } as never;

test("importing a bundle with no roster leaves the existing roster alone", async () => {
  // replaceRoster used to be called unconditionally, and normalizeRoster
  // coerces a missing roster to [] — so a roster-less bundle deleted every
  // instance of the project it was imported over.
  const save = await import("./save");
  reseed();
  save.importBundle({
    project: { id, meta: { name: "From Bundle" }, memory: "" },
    agents: [],
    office: EMPTY_OFFICE,
  });
  const p = projects.readProject(id)!;
  assert.equal(p.meta.name, "From Bundle", "precondition: the import did apply");
  assert.deepEqual(p.meta.roster.map((i) => i.instanceId), ["developer-aaa", "developer-bbb"]);
});

test("importing a bundle WITH a roster still restores it", async () => {
  const save = await import("./save");
  reseed();
  save.importBundle({
    project: { id, meta: { name: "X", roster: [{ instanceId: "developer-zzz", agentId: "developer" }] }, memory: "" },
    agents: [],
    office: EMPTY_OFFICE,
  });
  assert.deepEqual(projects.readProject(id)!.meta.roster.map((i) => i.instanceId), ["developer-zzz"]);
});
