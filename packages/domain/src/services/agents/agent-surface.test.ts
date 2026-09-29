/**
 * Guards the agent-facing surface — the strings and structures an agent
 * actually receives. Every defect this locks down was invisible in normal use
 * and survived for months, because nothing ever executed or asserted on what
 * we hand to agents.
 *
 *   pnpm --filter @agent-office/domain test
 */
import assert from "node:assert";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

function hasSqlite3(): boolean {
  try {
    execFileSync("bash", ["-c", "command -v sqlite3"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

import { historyNote } from "../projects/history";
import { composeAppendedPrompt, listAgents } from "./agents";
import { unknownTools } from "../../config/tools";
import { unresolvedSkills } from "../skills/skills";
import { DB_PATH } from "../infra/paths";

// ─── D1: every shell command we emit must be runnable verbatim ──────────────

test("historyNote emits an absolute, shell-safe db path", () => {
  const note = historyNote("developer", "default");
  assert.ok(!note.includes('"~'), 'a "~" inside double quotes is never expanded by a shell');
  assert.ok(note.includes(DB_PATH), "must carry the absolute DB path");
});

test("historyNote's sqlite3 command actually executes", { skip: !existsSync(DB_PATH) || !hasSqlite3() }, () => {
  const note = historyNote("developer", "default");
  const cmd = note.slice(note.indexOf("sqlite3"));
  // Throws on non-zero exit — which is exactly how this shipped broken.
  execFileSync("bash", ["-c", cmd], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
});

test("historyNote escapes quotes in ids", () => {
  const note = historyNote("dev'x", "inst'y");
  assert.ok(note.includes("dev''x") && note.includes("inst''y"), "single quotes must be doubled for SQL");
});

// ─── A38: no prompt segment may contain an unexpanded ~ inside quotes ───────

test("no assembled prompt segment emits a quoted tilde path", () => {
  for (const seg of composeAppendedPrompt("developer", null)) {
    assert.ok(!/"[^"]*~\//.test(seg.text), `segment "${seg.key}" emits a quoted ~ path: unrunnable`);
  }
});

// ─── D2: declared-but-missing skills must be visible, never silently dropped ─

test("a declared skill that does not resolve is reported, not skipped", () => {
  const segs = composeAppendedPrompt("developer", null);
  const skills = segs.find((s) => s.key === "skills");
  if (!skills) return; // agent declares no skills — nothing to assert
  const children = skills.children ?? [];
  assert.equal(children.length > 0, true, "declared skills must produce children");
  const missing = children.filter((c) => c.sub.includes("NOT INSTALLED"));
  if (missing.length > 0) {
    assert.match(skills.sub, /MISSING/, "the segment summary must announce missing skills");
    for (const m of missing) assert.equal(m.chars, 0, "a missing skill contributes 0 chars");
  }
});

// ─── Structural invariants of the prompt itself ─────────────────────────────

test("every segment has a key, a name and a phase", () => {
  for (const seg of composeAppendedPrompt("developer", null)) {
    assert.ok(seg.key, "segment missing key");
    assert.ok(seg.name, `segment ${seg.key} missing name`);
    assert.ok(seg.phase === "always" || seg.phase === "first-turn", `segment ${seg.key} has an unknown phase`);
  }
});

test("segment keys are unique", () => {
  const keys = composeAppendedPrompt("developer", null).map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length, "duplicate segment keys would collide in the UI");
});

// ─── A58: declared tool names must be recognisable ──────────────────────────

test("every tool declared by a bundled agent is a known tool", () => {
  const offenders: string[] = [];
  for (const a of listAgents()) {
    const bad = unknownTools(a.tools ?? []);
    if (bad.length > 0) offenders.push(`${a.name}: ${bad.join(", ")}`);
  }
  assert.deepEqual(offenders, [], `unknown tool names grant nothing silently:\n  ${offenders.join("\n  ")}`);
});

// ─── unresolvedSkills agrees with what the prompt segment reports ───────────

test("unresolvedSkills matches the skills segment's MISSING children", () => {
  const declared = listAgents().find((a) => a.name === "developer")?.skills ?? [];
  if (declared.length === 0) return;
  const missing = unresolvedSkills(declared);
  const segs = composeAppendedPrompt("developer", null);
  const children = segs.find((s) => s.key === "skills")?.children ?? [];
  const flagged = children.filter((c) => c.sub.includes("NOT INSTALLED")).map((c) => c.name);
  assert.deepEqual([...missing].sort(), [...flagged].sort(), "the two views of the same fact must agree");
});
