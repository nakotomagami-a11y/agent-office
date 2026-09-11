/**
 * Regression test for the shared frontmatter splitter. It replaced three
 * hand-rolled parsers (agents.ts, skills.ts ×3) — this locks in the shared
 * semantics, especially CRLF tolerance (GitHub-hosted SKILL.md files are
 * often \r\n; the old \n-anchored agents.ts regex silently returned {}).
 *
 *   node --experimental-strip-types --import ./packages/domain/src/services/ts-resolve-hook.mjs \
 *     packages/domain/src/services/infra/yaml.frontmatter.test.ts
 */
import assert from "node:assert";
import { parseFrontmatter } from "./yaml";

// Plain LF document.
{
  const { fm, body } = parseFrontmatter("---\nname: dev\ndescription: builds things\n---\n# Body\n");
  assert.strictEqual(fm.name, "dev");
  assert.strictEqual(fm.description, "builds things");
  assert.strictEqual(body, "# Body\n");
}

// CRLF document must parse identically to LF.
{
  const { fm, body } = parseFrontmatter("---\r\nname: dev\r\n---\r\nBody line\r\n");
  assert.strictEqual(fm.name, "dev", "CRLF frontmatter must parse");
  assert.strictEqual(body, "Body line\r\n", "body bytes are preserved as-is");
}

// No frontmatter → empty mapping, content untouched.
{
  const doc = "just markdown, no fences\n";
  const { fm, body } = parseFrontmatter(doc);
  assert.deepStrictEqual(fm, {});
  assert.strictEqual(body, doc);
}

// Junk YAML — the lenient in-house parser still yields *a* mapping, and the
// body is split off regardless. Locks in "garbage in never loses the body".
{
  const { body } = parseFrontmatter("---\n[: not yaml ::\n---\nrest\n");
  assert.strictEqual(body, "rest\n");
}

// Non-mapping YAML (a bare list) → empty mapping.
{
  const { fm } = parseFrontmatter("---\n- a\n- b\n---\nrest\n");
  assert.deepStrictEqual(fm, {});
}

console.log("✓ frontmatter splitter: all 5 cases passed");
