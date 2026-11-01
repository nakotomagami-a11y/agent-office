/**
 * Docs and pasted skills used an LF-only `^---\n` frontmatter match: a file saved
 * with Windows line endings read as having no frontmatter, so the doc vanished
 * from the list. Both now share the CRLF-safe `parseFrontmatterDetailed`.
 *
 *   pnpm --filter @agent-office/domain test src/services/docs/docs.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DOCS_DIR } from "../infra/paths";
import { listDocs, readDoc, upsertDoc } from "./docs";
import { importPastedSkill } from "../skills/skills";

test("a doc saved with CRLF line endings is still listed and read", () => {
  mkdirSync(join(DOCS_DIR, "dev"), { recursive: true });
  writeFileSync(
    join(DOCS_DIR, "dev", "crlf.md"),
    "---\r\ntitle: \"Windows doc\"\r\ncategory: notes\r\ncreated: 2026-10-01T00:00:00.000Z\r\nupdated: 2026-10-02T00:00:00.000Z\r\n---\r\n\r\nbody\r\n",
  );
  assert.ok(listDocs().some((d) => d.slug === "crlf" && d.title === "Windows doc"));
  assert.equal(readDoc("dev", "crlf")?.category, "notes");
});

test("a title with quotes round-trips without its escapes", () => {
  upsertDoc({ owner: "dev", slug: "quoted", title: 'Say "hi"', category: "notes", body: "x" });
  assert.equal(readDoc("dev", "quoted")?.title, 'Say "hi"');
});

test("a pasted skill with CRLF frontmatter imports with its name and tags", () => {
  const skill = importPastedSkill("---\r\nname: crlf-skill\r\ndescription: d\r\ntags: [a, b]\r\n---\r\n\r\n# Body\r\n");
  assert.equal(skill.name, "crlf-skill");
  assert.equal(skill.description, "d");
});
