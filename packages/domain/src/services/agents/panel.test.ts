/**
 * A council chair's `panel:` names the agents it will dispatch and what each
 * one argues. Frontmatter is hand-edited and bypasses every zod schema on the
 * API, so a malformed seat must be DROPPED, never forwarded — a seat whose
 * `agent` is not a usable id would otherwise reach a spawn as a subagent_type
 * the CLI cannot resolve, and the council would report a missing voice as
 * silence rather than as an error.
 */
import assert from "node:assert";
import { test } from "node:test";
import { asPanel } from "./agents";
import { parseFrontmatter, stringifyYaml, type YamlValue } from "../infra/yaml";

test("a well-formed panel round-trips in declared order", () => {
  const panel = asPanel([
    { agent: "cs-cto", seat: "architecture" },
    { agent: "cs-cfo", seat: "unit economics" },
  ]);
  assert.deepEqual(panel, [
    { agent: "cs-cto", seat: "architecture" },
    { agent: "cs-cfo", seat: "unit economics" },
  ]);
});

test("a seat with no agent id is dropped, not dispatched", () => {
  const panel = asPanel([{ seat: "architecture" }, { agent: "cs-cfo", seat: "cost" }]);
  assert.deepEqual(panel, [{ agent: "cs-cfo", seat: "cost" }]);
});

test("an agent id that is not a usable slug is dropped", () => {
  for (const bad of ["../../etc/passwd", "cs cto", "", "a/b"]) {
    assert.deepEqual(
      asPanel([{ agent: bad, seat: "x" }]),
      [],
      `${bad} must never reach a spawn`,
    );
  }
});

test("a seat with no description keeps the agent but carries no delta", () => {
  assert.deepEqual(asPanel([{ agent: "cs-cto" }]), [{ agent: "cs-cto", seat: "" }]);
});

test("the same agent may hold two seats", () => {
  const panel = asPanel([
    { agent: "developer", seat: "argue for the rewrite" },
    { agent: "developer", seat: "argue against the rewrite" },
  ]);
  assert.equal(panel.length, 2);
});

test("a non-list panel is no panel at all", () => {
  for (const bad of [undefined, null, "cs-cto", 42, { agent: "cs-cto" }]) {
    assert.deepEqual(asPanel(bad), [], `${String(bad)} is not a panel`);
  }
});

test("scalar entries are dropped rather than coerced into a seat", () => {
  assert.deepEqual(asPanel(["cs-cto", { agent: "cs-cfo", seat: "cost" }]), [
    { agent: "cs-cfo", seat: "cost" },
  ]);
});

/**
 * `writeAgent` rebuilds frontmatter from scratch on every save, so a council
 * edited through the agent editor — renamed, re-skilled, anything — would come
 * back with its panel silently gone. This walks the exact three functions in
 * that path rather than the filesystem, which needs a throwaway HOME.
 */
test("a panel survives the write/read round-trip the editor puts it through", () => {
  const panel = [
    { agent: "cs-cto", seat: "architecture & build-vs-buy" },
    { agent: "cs-cfo", seat: "unit economics" },
  ];
  const doc = `---\n${stringifyYaml({ name: "council-x", panel: panel as unknown as YamlValue }).trim()}\n---\n\nbody\n`;
  const { fm } = parseFrontmatter(doc);
  assert.deepEqual(asPanel(fm.panel), panel, "the editor must not silently drop a council's panel");
});
