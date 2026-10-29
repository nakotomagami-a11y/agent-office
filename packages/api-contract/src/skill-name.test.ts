/**
 * The skill name becomes a directory under ~/.claude/agents/_skills, and
 * installSkill rmSync's it before renaming the staging dir into place. These
 * schemas spelled the charset out as `/^[A-Za-z0-9._-]+$/`, which accepts
 * `..` — so `{"name":".."}` pointed that delete at ~/.claude/agents.
 */
import assert from "node:assert";
import { test } from "node:test";
import { skillCreateSchema, skillInstallSchema } from "./schemas";

const install = (name: string) =>
  skillInstallSchema.safeParse({ source: "owner/repo", ref: "main", path: "skills/x", name }).success;
const create = (name: string) => skillCreateSchema.safeParse({ name, body: "b" }).success;

test("a traversing or hidden skill name is refused at the boundary", () => {
  for (const name of ["..", ".", "../..", "../_skills", "a/b", "a\\b", ".hidden", "", "x".repeat(129)]) {
    assert.strictEqual(install(name), false, `skillInstallSchema must reject ${JSON.stringify(name)}`);
    assert.strictEqual(create(name), false, `skillCreateSchema must reject ${JSON.stringify(name)}`);
  }
});

test("ordinary skill names still pass", () => {
  for (const name of ["pt-ponytail", "my_skill", "skill.v2", "a", "x".repeat(128)]) {
    assert.strictEqual(install(name), true, `skillInstallSchema must accept ${JSON.stringify(name)}`);
    assert.strictEqual(create(name), true, `skillCreateSchema must accept ${JSON.stringify(name)}`);
  }
});
