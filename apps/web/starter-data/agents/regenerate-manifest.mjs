#!/usr/bin/env node
// Regenerate MANIFEST.json for the bundled starter agents.
//
// The manifest lives next to the agent .md files at
// `apps/web/starter-data/agents/MANIFEST.json`. It's consumed by
// `/api/starter/agent-diff` to detect drift between bundle and installed
// agents. Every field is derived from the .md files on disk — running
// this script IS the source of truth.
//
// Usage:
//   node apps/web/starter-data/agents/regenerate-manifest.mjs [--version=YYYY-MM-DD-N]
//
// Version bump rules:
//   * If --version is provided, use it verbatim.
//   * Otherwise use today's date with a `-1` suffix. If a manifest already
//     exists with today's date, bump the trailing counter.
//
// The version bump triggers the in-app migration modal for existing users,
// so ALWAYS regenerate when a bundled agent changes.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "MANIFEST.json");

function shortHash(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

function parseFrontmatterSubset(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\n/)) {
    const kv = line.match(/^(name|description):\s*(.*)$/);
    if (!kv) continue;
    let val = kv[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[kv[1]] = val;
  }
  return out;
}

function todayStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function pickVersion(existing, override) {
  if (override) return override;
  const stamp = todayStamp();
  if (existing?.startsWith(stamp + "-")) {
    const n = parseInt(existing.slice(stamp.length + 1), 10);
    if (Number.isFinite(n)) return `${stamp}-${n + 1}`;
  }
  return `${stamp}-1`;
}

const versionArg = process.argv.find((a) => a.startsWith("--version="))?.slice("--version=".length);

let existingVersion = null;
if (existsSync(MANIFEST_PATH)) {
  try {
    existingVersion = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")).version;
  } catch {
    /* fall through */
  }
}
const version = pickVersion(existingVersion, versionArg);

const files = readdirSync(HERE)
  .filter((f) => f.endsWith(".md"))
  // Exclude the directory README and any doc without agent frontmatter, so a
  // plain markdown file is never shipped as a bogus "README" agent.
  .filter((f) => f.toLowerCase() !== "readme.md")
  .filter((f) => /^---\n[\s\S]*?\n---\n?/.test(readFileSync(join(HERE, f), "utf8")))
  .sort();

const agents = files.map((file) => {
  const raw = readFileSync(join(HERE, file), "utf8");
  const fm = parseFrontmatterSubset(raw);
  return {
    file,
    name: fm.name ?? file.replace(/\.md$/, ""),
    description: fm.description ?? "",
    hash: shortHash(raw),
  };
});

const out = {
  version,
  generated: todayStamp(),
  note: "Regenerate on any starter agent change. Version bump triggers the migration modal in-app.",
  agents,
};

writeFileSync(MANIFEST_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`[manifest] wrote ${agents.length} agents at version ${version}`);
