/**
 * Wave 6's precondition: any repo can get a `CLAUDE.md` map, not just ones
 * Agent Office scaffolded.
 *
 * The load-bearing property is NOT the rendering — it is the refusal. A
 * generator that overwrites a hand-written orientation doc destroys exactly
 * the content it exists to supply, and it does so silently. That is the same
 * class as #154 (a write that erased a roster) and #161 (a write that doubled
 * every row), so it is pinned first and hardest.
 *
 *   pnpm --filter @agent-office/domain test
 */
import assert from "node:assert";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PROJECT_MAP_MARKER,
  isRegenerable,
  refreshProjectMap,
  renderProjectMap,
} from "./project-map-file";

const made: string[] = [];
process.on("exit", () => { for (const r of made) rmSync(r, { recursive: true, force: true }); });

function repo(files: Record<string, string> = {}, dirs: string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), "ao-map-"));
  made.push(root);
  for (const d of dirs) mkdirSync(join(root, d), { recursive: true });
  for (const [f, body] of Object.entries(files)) {
    mkdirSync(join(root, f, ".."), { recursive: true });
    writeFileSync(join(root, f), body);
  }
  return root;
}
const read = (root: string) => readFileSync(join(root, "CLAUDE.md"), "utf8");

// --- the refusal ------------------------------------------------------------

test("a hand-written CLAUDE.md is NEVER overwritten", () => {
  const root = repo({ "CLAUDE.md": "# My own notes\n\nDo not clobber me.\n" });
  const r = refreshProjectMap("p", root, "Proj");
  assert.equal(r.written, false);
  assert.equal(r.reason, "handwritten");
  assert.match(read(root), /Do not clobber me/, "the file must be untouched");
});

test("a file we generated IS regenerated", () => {
  const root = repo({ "CLAUDE.md": `${PROJECT_MAP_MARKER}\n\n# Old\n` }, ["src"]);
  assert.equal(refreshProjectMap("p", root, "Proj").written, true);
  assert.match(read(root), /# Proj/);
});

test("force overwrites, because the refusal must be escapable on purpose", () => {
  const root = repo({ "CLAUDE.md": "# Mine\n" });
  assert.equal(refreshProjectMap("p", root, "Proj", { force: true }).written, true);
  assert.match(read(root), /# Proj/);
});

test("an unreadable CLAUDE.md is treated as precious, not as absent", () => {
  // `isRegenerable` returning true on a read error would turn a transient
  // permissions problem into data loss.
  const root = repo();
  mkdirSync(join(root, "CLAUDE.md")); // a directory: readFileSync throws EISDIR
  assert.equal(isRegenerable(root), false);
  // The predicate is not the guarantee — pin the refusal itself.
  assert.equal(refreshProjectMap("p", root, "Proj").reason, "handwritten");
});

test("a missing CLAUDE.md is written, and carries the marker", () => {
  const root = repo({}, ["src"]);
  const r = refreshProjectMap("p", root, "Proj");
  assert.equal(r.written, true);
  assert.ok(read(root).startsWith(PROJECT_MAP_MARKER), "without the marker the next run would refuse");
});

test("a project with no cwd on disk is skipped, not crashed", () => {
  assert.equal(refreshProjectMap("p", undefined, "Proj").reason, "no_cwd");
  assert.equal(refreshProjectMap("p", "/nonexistent/x", "Proj").reason, "no_cwd");
});

// --- the rendering ----------------------------------------------------------

test("layout lists real directories and skips build output", () => {
  const root = repo({}, ["src", "docs", "node_modules", ".git", "dist"]);
  const md = renderProjectMap("Proj", root);
  assert.match(md, /`src\/`/);
  assert.match(md, /`docs\/`/);
  assert.doesNotMatch(md, /node_modules/, "build output is noise, not layout");
  assert.doesNotMatch(md, /`dist\/`/);
});

test("convention docs are pointed at, excluding CLAUDE.md itself", () => {
  const root = repo({ "AGENTS.md": "x", "CONTRIBUTING.md": "x", "CLAUDE.md": PROJECT_MAP_MARKER });
  const md = renderProjectMap("Proj", root);
  assert.match(md, /`AGENTS\.md`/);
  assert.doesNotMatch(md, /- `CLAUDE\.md`/, "a map that points at itself is noise");
});

test("run commands are detected from the project, not assumed", () => {
  // writeRootClaude hardcoded `pnpm dev` / `uv run uvicorn`. This reads scripts.
  const root = repo({
    "package.json": JSON.stringify({ name: "x", scripts: { build: "tsc", dev: "vite" } }),
  });
  const md = renderProjectMap("Proj", root);
  assert.match(md, /## Run/);
  assert.match(md, /^build\s+npm run build$/m, "the detected command, not just the word");
  assert.match(md, /^dev\s+npm run dev$/m, "the dev script the fixture sets up");
});

test("the same command detected twice is listed once", () => {
  // Two .ao.json entries, one argv. A map that lists `vite --port 1` twice
  // under different names tells an agent there are two things to run.
  const root = repo({
    ".ao.json": JSON.stringify({
      devCommands: [{ name: "a", cmd: "vite --port 1" }, { name: "b", cmd: "vite --port 1" }],
    }),
  });
  const md = renderProjectMap("Proj", root);
  assert.equal(md.split("vite --port 1").length - 1, 1, `listed twice:\n${md}`);
});

test("a repo with nothing detectable still renders a valid document", () => {
  const md = renderProjectMap("Empty", repo());
  assert.ok(md.startsWith(PROJECT_MAP_MARKER));
  assert.match(md, /# Empty/);
  assert.ok(md.endsWith("\n"), "a file must end with a newline");
});

test("a hostile project name cannot forge document structure", () => {
  // Names reach this from a scanned directory. `clean` strips control chars;
  // this pins that a newline cannot inject a heading.
  const md = renderProjectMap("Evil\n## Injected\nmore", repo());
  const headings = md.split("\n").filter((l) => l.startsWith("## "));
  assert.ok(!headings.includes("## Injected"), `forged heading present: ${headings.join("|")}`);
});
