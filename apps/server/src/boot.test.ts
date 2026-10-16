import assert from "node:assert";
import { mock, test } from "node:test";
import fs, { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { seedStarterSkills } from "./boot";

function fixture(): { root: string; skills: string; starter: string } {
  const root = mkdtempSync(join(tmpdir(), "ao-seed-"));
  const starter = join(root, "starter");
  for (const name of ["claude-api", "i-have-adhd"]) {
    mkdirSync(join(starter, "skills", name), { recursive: true });
    writeFileSync(join(starter, "skills", name, "SKILL.md"), `# ${name}`);
  }
  return { root, skills: join(root, "_skills"), starter };
}

const installed = (dir: string) => readdirSync(dir).filter((n) => !n.startsWith("_")).sort();
function marker(dir: string): unknown[] {
  const raw: unknown = JSON.parse(readFileSync(join(dir, "_seeded.json"), "utf8"));
  assert.ok(Array.isArray(raw));
  return raw;
}

test("a fresh machine gets every bundled skill and a marker naming them", () => {
  const f = fixture();
  try {
    seedStarterSkills(f.skills, f.starter);
    assert.deepEqual(installed(f.skills), ["claude-api", "i-have-adhd"]);
    assert.deepEqual(marker(f.skills), ["claude-api", "i-have-adhd"]);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("an install seeded before the marker existed gets only skills bundled since", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.skills, "my-own"), { recursive: true });
    seedStarterSkills(f.skills, f.starter);
    // claude-api was in the pre-marker bundle and is absent: the user removed it.
    assert.deepEqual(installed(f.skills), ["i-have-adhd", "my-own"]);
    assert.ok(marker(f.skills).includes("claude-api"));
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("an uninstalled bundled skill stays gone, and an unchanged marker is not rewritten", () => {
  const f = fixture();
  try {
    seedStarterSkills(f.skills, f.starter);
    rmSync(join(f.skills, "i-have-adhd"), { recursive: true });
    // Compact on purpose: a rewrite pretty-prints, so equal bytes prove no write happened.
    writeFileSync(join(f.skills, "_seeded.json"), '["claude-api","i-have-adhd"]');
    seedStarterSkills(f.skills, f.starter);
    assert.deepEqual(installed(f.skills), ["claude-api"]);
    assert.equal(readFileSync(join(f.skills, "_seeded.json"), "utf8"), '["claude-api","i-have-adhd"]');
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("a corrupt marker is rebuilt, and an emptied one (cleanup) seeds everything again", () => {
  const f = fixture();
  try {
    seedStarterSkills(f.skills, f.starter);
    writeFileSync(join(f.skills, "_seeded.json"), "{bad");
    seedStarterSkills(f.skills, f.starter);
    assert.ok(marker(f.skills).includes("claude-api") && marker(f.skills).includes("i-have-adhd"));

    rmSync(join(f.skills, "claude-api"), { recursive: true });
    mkdirSync(join(f.skills, "installed-after-wipe"));
    writeFileSync(join(f.skills, "_seeded.json"), "[]");
    seedStarterSkills(f.skills, f.starter);
    assert.ok(existsSync(join(f.skills, "claude-api", "SKILL.md")));
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("a skill whose copy fails is left unmarked and unstaged, the rest still land, and the next boot retries it", () => {
  const f = fixture();
  const realRename = fs.renameSync;
  mock.method(fs, "renameSync", (from: fs.PathLike, to: fs.PathLike) => {
    if (String(to).endsWith("i-have-adhd")) throw Object.assign(new Error("EPERM"), { code: "EPERM" });
    realRename(from, to);
  });
  syncBuiltinESMExports();
  try {
    seedStarterSkills(f.skills, f.starter);
    assert.deepEqual(installed(f.skills), ["claude-api"]);
    assert.deepEqual(marker(f.skills), ["claude-api"]);
    assert.deepEqual(readdirSync(f.skills).filter((n) => n.startsWith("_seeding-")), []);

    mock.restoreAll();
    syncBuiltinESMExports();
    seedStarterSkills(f.skills, f.starter);
    assert.deepEqual(installed(f.skills), ["claude-api", "i-have-adhd"]);
  } finally {
    mock.restoreAll();
    syncBuiltinESMExports();
    rmSync(f.root, { recursive: true, force: true });
  }
});
