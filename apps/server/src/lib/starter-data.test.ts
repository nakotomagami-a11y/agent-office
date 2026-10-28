/**
 * The roster migration overwrote newer agents with an older bundle (S1-1), could not tell a local
 * edit from a bundle change (S1-2), ignored "Remind me later" and never recorded the first-run
 * import (S1-3), read no frontmatter from a CRLF bundle (S1-4), and put its backups where the
 * CLI loads them as agents (C1).
 *
 *   pnpm --filter @agent-office/server test src/lib/starter-data.test.ts
 */
import assert from "node:assert";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { AGENTS_DIR, AGENT_BACKUPS_DIR, APP_STATE_DIR } from "@agent-office/domain/services/infra/paths";
import {
  applyAgentMigration,
  compareBundleVersions,
  computeAgentDiff,
  importStarterAgents,
  parseFrontmatterSubset,
} from "./starter-data";

const VERSION_FILE = join(APP_STATE_DIR, "agent-manifest-version");
const RECORD_FILE = join(APP_STATE_DIR, "agent-install-record.json");
const IDS = ["sd-alpha", "sd-beta", "sd-gamma", "sd-delta"];

const agentFile = (id: string, text: string) => `---\nname: ${id}\ndescription: ${text}\n---\n\n${text}\n`;
const hash = (s: string) => createHash("sha256").update(s.replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);

/** A starter bundle on disk; AGENT_OFFICE_STARTER_DATA points the server at it. */
function bundle(version: string, agents: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "ao-starter-"));
  mkdirSync(join(dir, "agents"));
  const entries = Object.entries(agents).map(([id, text]) => {
    writeFileSync(join(dir, "agents", `${id}.md`), agentFile(id, text));
    return { file: `${id}.md`, name: id, description: text, hash: hash(agentFile(id, text)) };
  });
  writeFileSync(join(dir, "agents", "MANIFEST.json"), JSON.stringify({ version, agents: entries }));
  process.env["AGENT_OFFICE_STARTER_DATA"] = dir;
}

const install = (id: string, text: string) => writeFileSync(join(AGENTS_DIR, `${id}.md`), agentFile(id, text));
const diff = () => {
  const out = computeAgentDiff();
  assert.ok(out.ok);
  return out.diff;
};

beforeEach(() => {
  mkdirSync(AGENTS_DIR, { recursive: true });
  for (const id of IDS) rmSync(join(AGENTS_DIR, `${id}.md`), { force: true });
  for (const f of ["agent-manifest-version", "agent-manifest-skipped.json", "agent-install-record.json"]) {
    rmSync(join(APP_STATE_DIR, f), { force: true });
  }
});

test("bundle versions order as numbers, not strings", () => {
  assert.ok(compareBundleVersions("2026-10-11-1", "2026-10-06-1")! > 0);
  assert.ok(compareBundleVersions("2026-10-06-10", "2026-10-06-9")! > 0);
  assert.equal(compareBundleVersions("2026-10-06-1", "2026-10-06-1"), 0);
  assert.equal(compareBundleVersions("dev", "2026-10-06-1"), null);
});

test("CRLF frontmatter is read (the Windows checkout of the bundle)", () => {
  assert.deepEqual(parseFrontmatterSubset("---\r\nname: dev\r\ndescription: Builds\r\n---\r\n\r\nbody"), { name: "dev", description: "Builds" });
});

test("an older bundle offers nothing and refuses to overwrite the newer roster", () => {
  bundle("2026-10-06-1", { "sd-alpha": "old text", "sd-beta": "old new agent" });
  install("sd-alpha", "newer text");
  mkdirSync(APP_STATE_DIR, { recursive: true });
  writeFileSync(VERSION_FILE, "2026-10-11-1\n");

  const d = diff();
  assert.equal(d.bundleOlder, true);
  assert.deepEqual([d.newAgents, d.changed, d.editedLocally], [[], [], []]);

  const out = applyAgentMigration(["sd-alpha"], [], true);
  assert.deepEqual(out, { ok: false, error: "bundle_older", status: 409 });
  assert.match(readFileSync(join(AGENTS_DIR, "sd-alpha.md"), "utf8"), /newer text/);
  assert.equal(readFileSync(VERSION_FILE, "utf8").trim(), "2026-10-11-1");
});

test("each changed agent says whether the bundle, the local copy, or both changed", () => {
  bundle("2026-10-11-1", { "sd-alpha": "v2", "sd-beta": "v1", "sd-gamma": "v2", "sd-delta": "v2" });
  install("sd-alpha", "v1");
  install("sd-beta", "v1 edited");
  install("sd-gamma", "v1 edited");
  install("sd-delta", "v1");
  const v1 = (id: string) => hash(agentFile(id, "v1"));
  writeFileSync(RECORD_FILE, JSON.stringify({ agents: { "sd-alpha": v1("sd-alpha"), "sd-beta": v1("sd-beta"), "sd-gamma": v1("sd-gamma") } }));

  const d = diff();
  const kind = (id: string) => [...d.changed, ...d.editedLocally].find((e) => e.id === id)?.change;
  assert.equal(kind("sd-alpha"), "bundle_changed");
  assert.equal(kind("sd-beta"), "edited_locally");
  assert.equal(kind("sd-gamma"), "both");
  assert.equal(kind("sd-delta"), "unknown");
  assert.deepEqual(d.editedLocally.map((e) => e.id), ["sd-beta"], "a local edit with no bundle change is not an update");
});

test("an accepted update is backed up outside the agents folder and recorded", () => {
  bundle("2026-10-11-1", { "sd-alpha": "v2" });
  install("sd-alpha", "mine");

  const out = applyAgentMigration(["sd-alpha"], [], true);
  assert.ok(out.ok);
  assert.deepEqual(out.result.backedUp, ["sd-alpha"]);
  const backups = readdirSync(AGENT_BACKUPS_DIR).filter((f) => f.startsWith("sd-alpha.pre-2026-10-11-1."));
  assert.equal(backups.length, 1);
  assert.match(readFileSync(join(AGENT_BACKUPS_DIR, backups[0]!), "utf8"), /mine/);
  assert.ok(!existsSync(join(AGENTS_DIR, "_archive", "sd-alpha.pre-2026-10-11-1-backup.md")), "the CLI loads _archive/ as agents");
  const record = JSON.parse(readFileSync(RECORD_FILE, "utf8"));
  assert.equal(record.agents["sd-alpha"], hash(agentFile("sd-alpha", "v2")));
});

test("the first-run import records the version, what it installed, and what was declined", () => {
  bundle("2026-10-11-1", { "sd-alpha": "a", "sd-beta": "b" });
  const out = importStarterAgents(["sd-alpha"]);
  assert.ok(out.ok);

  assert.equal(readFileSync(VERSION_FILE, "utf8").trim(), "2026-10-11-1");
  const d = diff();
  assert.equal(d.installedVersion, d.bundleVersion, "the migration modal must not open straight after the wizard");
  assert.deepEqual(d.newAgents.find((e) => e.id === "sd-beta")?.declined, true);

  bundle("2026-10-20-1", { "sd-alpha": "a2", "sd-beta": "b" });
  const next = diff();
  assert.equal(next.changed.find((e) => e.id === "sd-alpha")?.change, "bundle_changed");
  assert.deepEqual(next.newAgents.find((e) => e.id === "sd-beta")?.declined, true, "declined stays declined on the next bundle");
});

test("skips hold for the version they were made for", () => {
  bundle("2026-10-11-1", { "sd-alpha": "a", "sd-beta": "b" });
  const later = applyAgentMigration([], ["sd-alpha"], false);
  assert.ok(later.ok);
  assert.ok(!existsSync(VERSION_FILE), "remind me later must not mark the version done");
  assert.deepEqual(diff().skipped, ["sd-alpha"]);
  assert.equal(diff().newAgents.find((e) => e.id === "sd-alpha")?.declined, undefined, "later is not a decline");

  const again = applyAgentMigration([], [], false);
  assert.ok(again.ok);
  assert.deepEqual(diff().skipped, [], "a slug un-skipped later is no longer skipped");

  applyAgentMigration([], ["sd-alpha"], false);
  bundle("2026-10-20-1", { "sd-alpha": "a", "sd-beta": "b" });
  assert.deepEqual(diff().skipped, []);
});

test("an update that failed leaves the version unstamped, so it is offered again", () => {
  bundle("2026-10-11-1", { "sd-alpha": "a", "sd-beta": "b" });
  rmSync(join(process.env["AGENT_OFFICE_STARTER_DATA"]!, "agents", "sd-alpha.md"));
  const out = applyAgentMigration(["sd-alpha", "sd-beta"], [], true);
  assert.ok(out.ok);
  assert.deepEqual(out.result.errors, [{ id: "sd-alpha", reason: "bundle_file_missing" }]);
  assert.ok(!existsSync(VERSION_FILE));
});

test("the wizard can finish with nothing picked on a build without starter data", () => {
  process.env["AGENT_OFFICE_STARTER_DATA"] = join(tmpdir(), "ao-no-starter-data-here");
  const prevCwd = process.cwd();
  process.chdir(tmpdir());
  try {
    assert.deepEqual(importStarterAgents([]), { ok: true, imported: 0, skipped: [] });
    assert.deepEqual(importStarterAgents(["sd-alpha"]), { ok: false, error: "starter_data_missing" });
  } finally {
    process.chdir(prevCwd);
  }
});

test("the first-run import leaves the version unstamped while an agent already here differs from the bundle", () => {
  bundle("2026-10-11-1", { "sd-alpha": "a", "sd-beta": "b" });
  install("sd-beta", "my own beta");
  assert.ok(importStarterAgents(["sd-alpha"]).ok);
  assert.ok(!existsSync(VERSION_FILE), "the migration modal must still offer the bundle's sd-beta");
  assert.equal(diff().changed.find((e) => e.id === "sd-beta")?.change, "unknown");
});
