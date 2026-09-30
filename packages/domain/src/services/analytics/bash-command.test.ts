/**
 * A52 — the tool chart was one bar at 94% saying "Bash", which is not
 * information. Labelling a Bash call by the program it ran drops the top bar
 * to 14% and surfaces 60 distinct labels on the real dataset.
 *
 * The cases below are the shapes agents actually produce, taken from the live
 * tool_calls table — `cd x && pnpm`, env prefixes, pipelines, heredocs.
 *
 *   pnpm --filter @agent-office/domain test
 */
import assert from "node:assert";
import { test } from "node:test";
import { headCommand, toolCallLabel } from "./bash-command";

const bash = (command: string) => toolCallLabel("Bash", JSON.stringify({ command }));

test("a plain command is its own head", () => {
  assert.equal(headCommand("git status"), "git");
  assert.equal(headCommand("pnpm -r typecheck"), "pnpm");
});

test("a cd hop does not swallow the real program", () => {
  // Agents prefix nearly everything with `cd <repo> &&`. Bucketing those under
  // "cd" would hide exactly what this chart exists to show.
  assert.equal(headCommand("cd /home/x/repo && pnpm build"), "pnpm");
  assert.equal(headCommand("cd /tmp; python3 x.py"), "python3");
});

test("a quoted or substituted assignment does NOT invent a program", () => {
  // The first version peeled `[^\s]*`, which is quote-blind: it produced a bar
  // called "merge-base" (not a program) and one called
  // "Office_0.1.2_amd64.deb" (a filename) on the live dataset.
  assert.equal(headCommand("MB=$(git merge-base origin/dev HEAD) && echo $MB"), null);
  assert.equal(headCommand('DEB="/x/Agent Office_0.1.2_amd64.deb"; ls "$DEB"'), null);
  assert.equal(headCommand('GIT_AUTHOR_NAME="A B" git commit -m x'), null);
  assert.equal(headCommand("FOO=bar"), null, "an assignment with no command is not a program");
});

test("a cd hop with a redirect is still a cd hop", () => {
  // `cd x 2>/dev/null && ls` used to label the chart "cd" — the one bucket
  // this module exists to prevent.
  assert.equal(headCommand("cd ~/.config/logs 2>/dev/null && ls"), "ls");
});

test("env assignments and wrappers are peeled", () => {
  assert.equal(headCommand("NODE_OPTIONS=--max-old-space-size=8192 pnpm build"), "pnpm");
  assert.equal(headCommand("sudo pacman -U pkg.tar.zst"), "pacman");
  assert.equal(headCommand("nohup pnpm dev"), "pnpm");
  assert.equal(headCommand("timeout 90 claude -p x"), "timeout", "timeout IS the program here");
});

test("a pipeline is named by what it set out to do", () => {
  assert.equal(headCommand("git log --oneline | grep fix | head -5"), "git");
  assert.equal(headCommand("(cd apps/web && pnpm test)"), "pnpm");
});

test("shell control flow is not a program", () => {
  // `for t in …; do …; done` bucketed as "for" would be a lie; better to fall
  // back to plain Bash than to invent a program name.
  assert.equal(headCommand("for f in *.md; do echo $f; done"), null);
  assert.equal(headCommand("until pgrep x; do sleep 1; done"), null);
  assert.equal(headCommand(""), null);
  assert.equal(headCommand("   "), null);
});

test("a call we cannot read stays plain Bash rather than being dropped", () => {
  // An unreadable call is still a call — discarding it would understate totals.
  assert.equal(toolCallLabel("Bash", "{}"), "Bash");
  assert.equal(toolCallLabel("Bash", null), "Bash");
  assert.equal(toolCallLabel("Bash", "not json at all"), "Bash");
  assert.equal(toolCallLabel("Bash", JSON.stringify({ command: 42 })), "Bash");
  assert.equal(bash("./scripts/run.sh"), "Bash", "a path is not a program name");
});

test("non-Bash tools keep their own name", () => {
  assert.equal(toolCallLabel("Read", JSON.stringify({ file_path: "/x" })), "Read");
  assert.equal(toolCallLabel("ReportFindings", null), "ReportFindings");
});

test("the label is what the chart renders", () => {
  assert.equal(bash("git push origin main"), "Bash: git");
  assert.equal(bash("cd /repo && gh pr create"), "Bash: gh");
});

test("peeling is bounded, and gives up rather than grinding", () => {
  // The loop would terminate anyway (each pass shrinks or breaks), so "it did
  // not hang" proves nothing. What the cap actually buys is a ceiling on work
  // for pathological input — and the observable price is that absurdly nested
  // input is NOT fully peeled. Pin that, or the cap can be deleted unnoticed.
  assert.equal(headCommand("(".repeat(3) + "git status"), "git", "normal nesting still peels");
  assert.equal(headCommand("(".repeat(40) + "git status"), null, "past the cap it gives up");

  const nasty = "(".repeat(20_000) + "git status";
  const started = Date.now();
  assert.doesNotThrow(() => headCommand(nasty));
  assert.ok(Date.now() - started < 500, "a capped peel stays fast on hostile input");
});
