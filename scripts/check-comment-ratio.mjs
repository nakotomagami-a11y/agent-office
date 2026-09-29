#!/usr/bin/env node
/**
 * RULE code.comments-explain-why — comment-ratio ratchet.
 *
 * A hard ceiling would fail a dozen existing files on day one and get switched
 * off within a week. So: baseline every file's current ratio, fail only when a
 * file's ratio INCREASES, and hold new files to the target.
 *
 * Context: the TypeScript core sits near 19% comment lines. Agents replicate the
 * patterns already in the repo, so the density is self-sustaining — a one-off
 * cleanup would regrow. This converts "delete 5,000 comments" into "never add
 * the 5,001st".
 *
 *   node scripts/check-comment-ratio.mjs            # check (CI)
 *   node scripts/check-comment-ratio.mjs --update   # re-baseline after a cleanup
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BASELINE = "comment-ratio-baseline.json";
const NEW_FILE_CEILING = 0.15;
// Below this the ceiling is not enforced: in a 40-line module a single JSDoc
// block is a large fraction, and the rule targets comment sprawl in real files,
// not API docs on small ones. Regressions are still caught for every size.
const MIN_CODE_LINES_FOR_CEILING = 80;
const TOLERANCE = 0.01; // absolute, absorbs rounding on tiny files

function measure(file) {
  let comment = 0, code = 0, inBlock = false;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const s = raw.trim();
    if (!s) continue;
    if (inBlock) { comment++; if (s.includes("*/")) inBlock = false; continue; }
    if (s.startsWith("/*")) { comment++; if (!s.includes("*/")) inBlock = true; continue; }
    if (s.startsWith("//") || s.startsWith("*")) { comment++; continue; }
    code++;
  }
  return { ratio: code === 0 ? 0 : comment / code, code };
}

const ratio = (f) => measure(f).ratio;

const files = execFileSync("bash", ["-c",
  `git ls-files '*.ts' '*.tsx' | grep -v '\\.test\\.' || true`], { encoding: "utf8" })
  .split("\n").filter(Boolean);

const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};

// A moved file is not new code. Without this, relocating a module hits the
// stricter new-file ceiling and the only way out is re-baselining everything —
// which defeats the ratchet. Git already knows it was a rename.
const renames = new Map();
try {
  const out = execFileSync("bash", ["-c",
    "git diff --find-renames --name-status HEAD -- '*.ts' '*.tsx' 2>/dev/null || true"],
    { encoding: "utf8" });
  for (const line of out.split("\n")) {
    const m = /^R\d*\s+(\S+)\s+(\S+)$/.exec(line.trim());
    if (m) renames.set(m[2], m[1]);
  }
} catch { /* not a repo, or git unavailable — fall back to new-file rules */ }

if (process.argv.includes("--update")) {
  const next = {};
  for (const f of files) {
    const m = measure(f);
    next[f] = { ratio: Number(m.ratio.toFixed(4)), code: m.code };
  }
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + "\n");
  console.log(`baselined ${files.length} files`);
  process.exit(0);
}

const failures = [];
for (const f of files) {
  const m = measure(f);
  const now = m.ratio;
  const prev = base[f] ?? base[renames.get(f)];
  // Old baselines stored a bare number.
  const was = typeof prev === "number" ? prev : prev?.ratio;
  const wasCode = typeof prev === "number" ? undefined : prev?.code;

  // Deleting code raises the ratio arithmetically without adding a single
  // comment. Punishing that would make the rule discourage removing code,
  // which is the opposite of the point.
  if (was !== undefined && wasCode !== undefined && m.code < wasCode) continue;

  if (was === undefined) {
    if (now > NEW_FILE_CEILING && m.code >= MIN_CODE_LINES_FOR_CEILING) {
      failures.push(`${f}: new file at ${(now * 100).toFixed(0)}% comments (ceiling ${NEW_FILE_CEILING * 100}%)`);
    }
  } else if (now > was + TOLERANCE) {
    failures.push(`${f}: ${(was * 100).toFixed(0)}% -> ${(now * 100).toFixed(0)}% (comments grew)`);
  }
}

if (failures.length) {
  console.error("RULE code.comments-explain-why (docs/conventions.md)");
  console.error("Comments explain WHY, never WHAT. Delete restated code, or rewrite");
  console.error("the comment to capture a constraint, gotcha or decision.\n");
  for (const f of failures) console.error("  " + f);
  console.error(`\n${failures.length} file(s) regressed. After a genuine cleanup: node scripts/check-comment-ratio.mjs --update`);
  process.exit(1);
}
console.log(`comment ratio OK (${files.length} files)`);
