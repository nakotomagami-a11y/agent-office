/**
 * Two defects this file pins, both reachable from the HTTP surface:
 *
 *   1. `installSkill("..")` resolved `dest` to AGENTS_DIR and rmSync'd it —
 *      one request deleted every agent definition the user owned.
 *   2. Saving a skill rebuilt its frontmatter from name/description/tags, so
 *      any other key (`license`, `allowed-tools`, …) was dropped on each edit.
 *
 *   pnpm --filter @agent-office/domain test src/services/skills/skills.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENTS_DIR, SKILLS_DIR } from "../infra/paths";
import { importPastedSkill, installSkill, readInstalledSkill, writeLocalSkill } from "./skills";

/** Swaps global fetch for the duration, recording every URL it was asked for. */
async function withFetch(
  run: (calls: string[]) => Promise<void>,
  reply: (url: string) => Response = () => new Response("", { status: 404 }),
): Promise<void> {
  const real = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    return Promise.resolve(reply(url));
  }) as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = real;
  }
}

function freshSkill(name: string, content: string): string {
  const dir = join(SKILLS_DIR, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), content);
  return dir;
}

test("installSkill refuses a traversing name before it can delete anything", async () => {
  mkdirSync(AGENTS_DIR, { recursive: true });
  const bystander = join(AGENTS_DIR, "keep-me.md");
  writeFileSync(bystander, "an agent definition");

  for (const name of ["..", ".", "../_skills", "a/b", ".hidden"]) {
    await assert.rejects(
      () => installSkill("owner/repo", "main", "skills/x", name),
      /invalid skill name/,
      `installSkill must reject ${JSON.stringify(name)}`,
    );
  }

  assert.equal(existsSync(bystander), true, "AGENTS_DIR must survive the traversal attempt");
  assert.equal(existsSync(AGENTS_DIR), true);
});

test("installSkill rejects before any network call", async () => {
  // Wall-clock cannot tell "guard ran first" from "GitHub 404'd quickly", and a
  // regression would make the unit suite talk to github.com. Count instead.
  await withFetch(async (calls) => {
    await assert.rejects(() => installSkill("owner/repo", "main", "p", ".."), /invalid skill name/);
    assert.equal(calls.length, 0, "the guard must precede fetchTree");
  });
});

test("a tree entry that climbs out of staging is refused, not written", async () => {
  // git fsck rejects `..` in a tree path, so this cannot be pushed to GitHub
  // today — the guard exists because that is upstream's invariant, not ours.
  const escape = join(AGENTS_DIR, "pwned.md");
  rmSync(escape, { force: true });
  const prefix = "skills/x";
  const tree = [
    { path: `${prefix}/SKILL.md`, type: "blob", sha: "a" },
    { path: `${prefix}/../../../../../../.claude/agents/pwned.md`, type: "blob", sha: "b" },
  ];

  await withFetch(
    async () => {
      await installSkill("owner/repo", "main", prefix, "escape-test");
      assert.equal(existsSync(escape), false, "a remote tree entry escaped the staging dir");
      assert.equal(existsSync(join(SKILLS_DIR, "escape-test", "SKILL.md")), true, "the legitimate file still installs");
    },
    (url) =>
      url.includes("git/trees")
        ? new Response(JSON.stringify({ tree }), { status: 200 })
        : new Response("body", { status: 200 }),
  );
});

test("editing a skill keeps frontmatter keys the editor does not model", () => {
  freshSkill(
    "carry-test",
    [
      "---",
      "name: carry-test",
      "description: original",
      "license: Apache-2.0",
      "allowed-tools: Read, Bash",
      "---",
      "",
      "original body",
      "",
    ].join("\n"),
  );

  writeLocalSkill(
    { name: "carry-test", description: "edited", tags: ["t"], body: "new body" },
    { overwrite: true },
  );

  const md = readFileSync(join(SKILLS_DIR, "carry-test", "SKILL.md"), "utf8");
  assert.match(md, /license: Apache-2\.0/, "license survived the edit");
  // Quoted on the way out: stringifyYaml quotes a scalar holding a comma.
  assert.match(md, /allowed-tools: "Read, Bash"/, "allowed-tools survived the edit");
  assert.match(md, /description: edited/, "the edited field won");
  assert.doesNotMatch(md, /description: original/);
  assert.equal(readInstalledSkill("carry-test")?.body, "new body");
});

test("a managed field is never shadowed by the carried copy", () => {
  freshSkill(
    "shadow-test",
    ["---", "name: shadow-test", "description: stale", "tags:", "  - old", "---", "", "body"].join("\n"),
  );

  writeLocalSkill(
    { name: "shadow-test", description: "fresh", tags: ["new"], body: "body" },
    { overwrite: true },
  );

  const md = readFileSync(join(SKILLS_DIR, "shadow-test", "SKILL.md"), "utf8");
  assert.match(md, /description: fresh/);
  assert.doesNotMatch(md, /stale/);
  assert.doesNotMatch(md, /old/, "the previous tag list must not come back");
  assert.match(md, /tags: \[new\]/);
});

test("an installed skill reports the tags in its own file", () => {
  // The editor writes `tags` back from what it was handed, so if the read path
  // cannot see the file's list, every edit replaces it with the registry guess.
  freshSkill(
    "tags-test",
    ["---", "name: tags-test", "description: d", "tags:", "  - alpha", "  - beta", "---", "", "body"].join("\n"),
  );
  assert.deepEqual(readInstalledSkill("tags-test")?.tags, ["alpha", "beta"]);

  writeLocalSkill(
    { name: "tags-test", description: "d", tags: readInstalledSkill("tags-test")?.tags, body: "body" },
    { overwrite: true },
  );
  assert.deepEqual(readInstalledSkill("tags-test")?.tags, ["alpha", "beta"], "tags did not survive a round trip");
});

test("forking a skill carries none of the source's frontmatter", () => {
  // The carry reads the DESTINATION name, and a fork writes a name with no file
  // yet — so an upstream key cannot ride across into a skill whose provenance
  // writeLocalSkill deliberately drops. Pinned because MANAGED_FM is a 3-key
  // denylist: if the carry ever keyed off the source, that denylist would be
  // the only thing between an upstream `allowed-tools` and a "locally owned" skill.
  freshSkill(
    "fork-src",
    ["---", "name: fork-src", "description: upstream", "allowed-tools: Read, Bash", "---", "", "body"].join("\n"),
  );
  rmSync(join(SKILLS_DIR, "fork-src-fork"), { recursive: true, force: true });

  writeLocalSkill({ name: "fork-src-fork", description: "mine", body: "body" }, { overwrite: false });

  const forked = readFileSync(join(SKILLS_DIR, "fork-src-fork", "SKILL.md"), "utf8");
  assert.doesNotMatch(forked, /allowed-tools/, "a fork must not inherit the source's frontmatter");
  assert.match(readFileSync(join(SKILLS_DIR, "fork-src", "SKILL.md"), "utf8"), /allowed-tools/, "the source is untouched");
});

test("a forged skill with no file on disk carries nothing and still writes", () => {
  rmSync(join(SKILLS_DIR, "forged-test"), { recursive: true, force: true });
  const saved = writeLocalSkill({ name: "forged-test", description: "d", body: "b" });
  assert.equal(saved.name, "forged-test");
  assert.equal(saved.description, "d");
  assert.equal(saved.body, "b");
});

test("importing pasted text keeps the pasted frontmatter's extra keys", () => {
  rmSync(join(SKILLS_DIR, "pasted-test"), { recursive: true, force: true });
  importPastedSkill(
    ["---", "name: pasted-test", "description: pasted", "license: MIT", "---", "", "pasted body", ""].join("\n"),
  );

  const md = readFileSync(join(SKILLS_DIR, "pasted-test", "SKILL.md"), "utf8");
  assert.match(md, /license: MIT/, "a key the user pasted must not be dropped on the way in");
  assert.equal(readInstalledSkill("pasted-test")?.body, "pasted body");
});

test("unreadable frontmatter degrades to carrying nothing, not to a throw", () => {
  freshSkill("broken-fm-test", "no frontmatter block at all\n");
  const saved = writeLocalSkill(
    { name: "broken-fm-test", description: "d", body: "b" },
    { overwrite: true },
  );
  assert.equal(saved.description, "d");
});

test("writeLocalSkill still refuses a traversing name", () => {
  for (const name of ["..", "../escape", "a/b", ".hidden"]) {
    assert.throws(
      () => writeLocalSkill({ name, body: "x" }, { overwrite: true }),
      /invalid skill name/,
    );
  }
});

test("a symlinked skill dir cannot redirect the write outside SKILLS_DIR", () => {
  // ensureDir(dest) is an existsSync check, which FOLLOWS a symlink: the dir
  // "exists", no mkdir happens, and writeFileAtomic then creates its temp file
  // and renames it inside whatever the link points at. The name is validated,
  // so this is the remaining way out of SKILLS_DIR on the write path.
  const outside = mkdtempSync(join(tmpdir(), "ao-skill-escape-"));
  const link = join(SKILLS_DIR, "linked-skill");
  mkdirSync(SKILLS_DIR, { recursive: true });
  rmSync(link, { recursive: true, force: true });
  symlinkSync(outside, link, "dir");

  try {
    assert.throws(
      () => writeLocalSkill({ name: "linked-skill", body: "pwned" }, { overwrite: true }),
      /skill path escapes SKILLS_DIR/,
    );
    assert.equal(
      existsSync(join(outside, "SKILL.md")),
      false,
      "nothing may be written through the symlink",
    );
  } finally {
    // Not cleanup hygiene: a surviving link leaves SKILLS_DIR pointing into
    // /tmp for every later test in this file, listInstalled() included.
    rmSync(link, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("a symlinked SKILL.md cannot redirect the write either", () => {
  const outside = mkdtempSync(join(tmpdir(), "ao-skill-file-escape-"));
  const victim = join(outside, "victim.md");
  writeFileSync(victim, "original");
  const dir = join(SKILLS_DIR, "linked-file-skill");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  symlinkSync(victim, join(dir, "SKILL.md"));

  // Covers two things this fix leans on but does not own: writeFileAtomic
  // renaming OVER a link instead of through it, and readSkillFrontmatter's
  // realpath bound — the carry read resolves to /tmp and must return nothing.
  try {
    writeLocalSkill({ name: "linked-file-skill", body: "new" }, { overwrite: true });
    assert.equal(readFileSync(victim, "utf8"), "original", "the link target must be untouched");
    assert.match(readFileSync(join(dir, "SKILL.md"), "utf8"), /new/, "the write lands inside SKILLS_DIR");
    assert.equal(lstatSync(join(dir, "SKILL.md")).isSymbolicLink(), false, "the rename replaced the link");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
