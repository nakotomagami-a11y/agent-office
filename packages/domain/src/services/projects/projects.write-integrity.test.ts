/**
 * Write-integrity guarantees for project.md.
 *
 * These exist because on 2026-09-30 a project silently lost its `accountId`
 * and three of four roster entries. The proven cause was a patch that carried
 * `accountId` as a PRESENT-BUT-UNDEFINED key, which a spread-merge then used to
 * overwrite a stored value the caller never mentioned. Everything here is a
 * regression test for that class, not for one field.
 *
 *   pnpm --filter @agent-office/domain test
 */
import assert from "node:assert";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// $HOME must point at a sandbox BEFORE importing anything that resolves paths.
const sandbox = mkdtempSync(join(tmpdir(), "ao-projwrite-"));
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

// --- the proven bug ---------------------------------------------------------

test("a patch that never mentions accountId does not clear it", () => {
  reseed();
  projects.updateProject(id, { meta: { shelved: true } });
  const p = projects.readProject(id)!;
  assert.equal(p.meta.accountId, "acc_keepme");
  assert.equal(p.meta.githubAccountId, "gh_keepme");
  assert.equal(p.meta.shelved, true);
});

test("a PRESENT-BUT-UNDEFINED key is treated as absent, not as a clear", () => {
  reseed();
  // This is the exact shape the route used to build via `?? undefined`.
  projects.updateProject(id, { meta: { accountId: undefined, githubAccountId: undefined, shelved: true } });
  const p = projects.readProject(id)!;
  assert.equal(p.meta.accountId, "acc_keepme", "undefined must not wipe a stored value");
  assert.equal(p.meta.githubAccountId, "gh_keepme");
});

test("explicit null clears a clearable field", () => {
  reseed();
  projects.updateProject(id, { meta: { accountId: null } });
  const p = projects.readProject(id)!;
  assert.equal(p.meta.accountId, undefined);
  assert.equal(p.meta.githubAccountId, "gh_keepme", "only the nulled field is cleared");
});

// --- roster is unreachable from the whole-object path ------------------------

test("a metadata patch leaves the roster untouched", () => {
  reseed();
  projects.updateProject(id, { meta: { name: "Renamed" } });
  const p = projects.readProject(id)!;
  assert.equal(p.meta.name, "Renamed");
  assert.deepEqual(p.meta.roster.map((i) => i.instanceId), ["developer-aaa", "developer-bbb"]);
});

test("a roster smuggled through updateProject is ignored, not applied", () => {
  reseed();
  // Blocked by the type system; a JS caller or a hand-rolled request body can
  // still try it, so the runtime must refuse to honour it.
  projects.updateProject(id, {
    meta: { name: "Sneaky", roster: [{ instanceId: "evil", agentId: "developer" }] },
  } as Parameters<typeof projects.updateProject>[1]);
  const p = projects.readProject(id)!;
  assert.deepEqual(p.meta.roster.map((i) => i.instanceId), ["developer-aaa", "developer-bbb"]);
});

test("replaceRoster is the sanctioned bulk path and does not disturb other fields", () => {
  reseed();
  projects.replaceRoster(id, [{ instanceId: "developer-ccc", agentId: "developer" }]);
  const p = projects.readProject(id)!;
  assert.deepEqual(p.meta.roster.map((i) => i.instanceId), ["developer-ccc"]);
  assert.equal(p.meta.accountId, "acc_keepme");
});

// --- per-instance mutation operates on current state -------------------------

test("removeInstance drops only its target and keeps accountId", () => {
  reseed();
  projects.removeInstance(id, "developer-aaa");
  const p = projects.readProject(id)!;
  assert.deepEqual(p.meta.roster.map((i) => i.instanceId), ["developer-bbb"]);
  assert.equal(p.meta.accountId, "acc_keepme");
});

test("removeInstance on an unknown id throws and writes nothing", () => {
  reseed();
  const before = readFileSync(metaPath, "utf8");
  assert.throws(() => projects.removeInstance(id, "nope"), /not found/i);
  assert.equal(readFileSync(metaPath, "utf8"), before);
});

test("an instance added out-of-band survives a later metadata patch", () => {
  reseed();
  const stale = projects.readProject(id)!; // caller's copy, taken before the edit
  reseed(SEED.replace(
    "accountId: acc_keepme",
    "- instanceId: developer-ccc\n  agentId: developer\naccountId: acc_keepme",
  ));
  // The caller writes using its stale view; the merge must happen against disk.
  projects.updateProject(id, { meta: { description: "later" } });
  const p = projects.readProject(id)!;
  assert.equal(stale.meta.roster.length, 2, "precondition: the caller's copy was stale");
  assert.deepEqual(
    p.meta.roster.map((i) => i.instanceId),
    ["developer-aaa", "developer-bbb", "developer-ccc"],
  );
});

// --- optimistic concurrency --------------------------------------------------

test("rev changes when the file changes", () => {
  reseed();
  const before = projects.readProject(id)!.rev;
  projects.updateProject(id, { meta: { description: "moved on" } });
  const after = projects.readProject(id)!.rev;
  assert.ok(before && after, "rev is populated");
  assert.notEqual(before, after);
});

test("a write carrying the current rev succeeds", () => {
  reseed();
  const rev = projects.readProject(id)!.rev!;
  projects.updateProject(id, { meta: { description: "fresh" }, expectedRev: rev });
  assert.equal(projects.readProject(id)!.meta.description, "fresh");
});

test("a write carrying a stale rev is refused and changes nothing", () => {
  reseed();
  const staleRev = projects.readProject(id)!.rev!;
  reseed(SEED.replace("Seeded", "Changed By Someone Else"));
  const before = readFileSync(metaPath, "utf8");

  assert.throws(
    () => projects.updateProject(id, { meta: { description: "clobber" }, expectedRev: staleRev }),
    (err: unknown) => {
      assert.ok(err instanceof projects.StaleProjectWriteError);
      assert.equal((err as { code: string }).code, "stale_write");
      return true;
    },
  );
  assert.equal(readFileSync(metaPath, "utf8"), before, "refused write must not touch the file");
});

test("omitting expectedRev keeps the previous last-write-wins behaviour", () => {
  reseed();
  projects.updateProject(id, { meta: { description: "no token supplied" } });
  assert.equal(projects.readProject(id)!.meta.description, "no token supplied");
});
