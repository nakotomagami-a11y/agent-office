/**
 * Prompt rot in the agents a NEW user gets: skills that never load, pinned or stale models, and text
 * written for older models (docs/conventions.md `prompt.*`, docs/prompt-hygiene.md).
 * `starter-data-tools.test.ts` covers the tools these agents declare.
 */
import assert from "node:assert";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { EFFORT_OPTS } from "../../config/agent-opts";
import { MODEL_CATALOG, MODEL_IDS } from "../../config/models";
import { asStringList } from "./agents";
import { parseAgentFrontmatter, splitAgentFile } from "./frontmatter";

const STARTER = resolve(import.meta.dirname, "../../../../../apps/web/starter-data");
const AGENTS = join(STARTER, "agents");
const agentFiles = readdirSync(AGENTS).filter((f) => f.endsWith(".md") && f !== "README.md");
const read = (f: string) => readFileSync(join(AGENTS, f), "utf8").replace(/\r\n/g, "\n");

/** Parsed the way the app reads an agent, so a BOM or a YAML block list can't hide a file from the checks. */
function frontmatter(f: string) {
  const split = splitAgentFile(read(f));
  assert.ok(split, `${f}: no frontmatter block`);
  return parseAgentFrontmatter(split.yaml);
}

test("prompt.skills-ship: every declared skill ships with the starter data", () => {
  const missing: string[] = [];
  for (const f of agentFiles) {
    for (const s of asStringList(frontmatter(f).skills)) {
      if (!existsSync(join(STARTER, "skills", s, "SKILL.md"))) missing.push(`${f}: ${s}`);
    }
  }
  assert.deepEqual(missing, [], `prompt.skills-ship: a skill that isn't on disk loads nothing:\n  ${missing.join("\n  ")}`);
});

test("prompt.alias-models: aliases only, and a known effort", () => {
  const bad: string[] = [];
  for (const f of agentFiles) {
    const fm = frontmatter(f);
    // `model`/`effort` are the CLI's own keys, which the app mirrors from `default-*`.
    for (const key of ["default-model", "model"]) {
      const v = fm[key];
      if (v !== undefined && !(MODEL_IDS as readonly unknown[]).includes(v)) bad.push(`${f}: ${key} ${String(v)}`);
    }
    for (const key of ["default-effort", "effort"]) {
      const v = fm[key];
      if (v !== undefined && !(EFFORT_OPTS as readonly unknown[]).includes(v)) bad.push(`${f}: ${key} ${String(v)}`);
    }
  }
  assert.deepEqual(bad, [], `prompt.alias-models:\n  ${bad.join("\n  ")}`);
});

/** `claude-opus-5-5` → [5, 5]; date-suffixed snapshot ids are not versions. */
function version(id: string): number[] | null {
  const m = id.match(/^claude-[a-z]+-(\d+)(?:-(\d{1,2}))?$/);
  return m ? [Number(m[1]), Number(m[2] ?? 0)] : null;
}
const older = (a: number[], b: number[]) => a[0]! < b[0]! || (a[0] === b[0] && a[1]! < b[1]!);

test("prompt.alias-models: MODEL_CATALOG is no older than the bundled claude-api skill's model table", () => {
  const skill = readFileSync(join(STARTER, "skills/claude-api/SKILL.md"), "utf8").replace(/\r\n/g, "\n");
  // The table only: prose may name a preview or future id that the CLI alias doesn't resolve to yet.
  const table = skill.match(/^## Current Models[^\n]*\n([\s\S]*?)(?=\n## |\n\*\*)/m)?.[1];
  assert.ok(table, "claude-api SKILL.md has no '## Current Models' table: update this test's parser");
  const lagging: string[] = [];
  for (const id of MODEL_IDS) {
    const ours = version(MODEL_CATALOG[id].fullId);
    assert.ok(ours, `${id}: fullId ${MODEL_CATALOG[id].fullId} is not a versioned id`);
    let newest: { raw: string; v: number[] } | null = null;
    for (const [raw] of table.matchAll(new RegExp(`\\bclaude-${id}-\\d+(?:-\\d+)?\\b`, "g"))) {
      const v = version(raw);
      if (v && (!newest || older(newest.v, v))) newest = { raw, v };
    }
    if (newest && older(ours, newest.v)) lagging.push(`${id}: catalog ${MODEL_CATALOG[id].fullId}, skill knows ${newest.raw}`);
  }
  assert.deepEqual(lagging, [], `prompt.alias-models: bump fullId in config/models.ts:\n  ${lagging.join("\n  ")}`);
});

/** `quoted: true` cues skip quoted text: agent-architect lists, in quotes, what not to write. */
const DATED_CUES: { re: RegExp; why: string; quoted: boolean }[] = [
  { re: /\bthink (hard|harder|carefully|deeply)\b|\bultrathink\b/i, why: "thinking cue: effort sets thinking", quoted: true },
  { re: /\bthink(ing)? step[- ]by[- ]step\b/i, why: "thinking cue: effort sets thinking", quoted: true },
  { re: /\bdouble[- ]check|\bverify twice\b|\bre-verify\b/i, why: "re-verification: the model checks its own work", quoted: true },
  { re: /\bmaximally thorough\b|\bleave no stone\b|\bif in doubt, use\b/i, why: "anti-laziness order: causes overtriggering", quoted: true },
  { re: /\bone question (at a time|per turn)\b|\bnever bundle\b/i, why: "one-at-a-time interview: ask the open decisions in one round", quoted: true },
  { re: /handoff \(mandatory\)|\bdo not skip (this )?on\b.{0,3}small/i, why: "mandatory end-of-run handoff: keep NEXT_SESSION.md current as you go", quoted: false },
  { re: /\/path\/to\//, why: "placeholder path that never resolves", quoted: false },
];

const unquoted = (s: string) => s.replace(/"[^"\n]*"|“[^”\n]*”|`[^`\n]*`/g, "");

test("prompt.no-dated-cues: no text written for older models", () => {
  const hits: string[] = [];
  for (const f of agentFiles) {
    read(f).split("\n").forEach((line, i) => {
      const bare = unquoted(line);
      for (const { re, why, quoted } of DATED_CUES) {
        if (re.test(quoted ? bare : line)) hits.push(`${f}:${i + 1} ${why}: ${line.trim().slice(0, 90)}`);
      }
    });
  }
  assert.deepEqual(hits, [], `prompt.no-dated-cues (docs/conventions.md):\n  ${hits.join("\n  ")}`);
});
