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

test("a quoted or substituted assignment resolves to the real program", () => {
  // These produced live bars called "merge-base" (not a program) and
  // "Office_0.1.2_amd64.deb" (a FILENAME). The regex version could only fall
  // back to null; the scanner reads the value as one token and moves past it,
  // so the actual command is recovered rather than merely not-invented.
  assert.equal(headCommand("MB=$(git merge-base origin/dev HEAD) && echo $MB"), "echo");
  assert.equal(headCommand('DEB="/x/Agent Office_0.1.2_amd64.deb"; ls "$DEB"'), "ls");
  assert.equal(headCommand('GIT_AUTHOR_NAME="A B" git commit -m x'), "git");
  assert.equal(headCommand("FOO=bar"), null, "an assignment with no command is not a program");
});

test("a cd hop is skipped however its path is written", () => {
  // Three review rounds each found another shape the old regex could not see.
  // The scanner reads tokens, so quoting and `$( )` are not special cases.
  assert.equal(headCommand("cd ~/.config/logs 2>/dev/null && ls"), "ls");
  assert.equal(headCommand('cd "/usr/lib/Agent Office/server" && echo hi'), "echo");
  assert.equal(headCommand("cd '/home/x/My Repo' && pnpm build"), "pnpm");
  assert.equal(headCommand("cd $(git rev-parse --show-toplevel) && pnpm build"), "pnpm");
  assert.equal(headCommand("cd /x || exit 1; pnpm build"), "pnpm", "|| is a separator too");
});

test("a substitution body is not walked into", () => {
  // readToken counted `)` without counting `(`, so a bare paren inside a
  // substitution closed it early and the scan wandered into the body. Prose
  // in a heredoc'd commit message produced a live bar called `Bash: run`.
  assert.equal(headCommand("MSG=$(cat <<EOF\nsee (note) python3 x\nEOF\n) && git commit"), "git");
  assert.equal(headCommand("X=$(foo (bar) baz); ls"), "ls");
  assert.equal(headCommand("cd $(dirname (x)) && pnpm build"), "pnpm");
});

test("a timeout flag's value is not mistaken for the program", () => {
  // `-s` was consumed but `KILL` was not, so it rendered `Bash: KILL`.
  assert.equal(headCommand("timeout -s KILL 30 pnpm test"), "pnpm");
  assert.equal(headCommand("timeout -k 5 10 claude -p x"), "claude");
  assert.equal(headCommand("timeout --signal=KILL 10 pnpm test"), "pnpm");
});

test("a line continuation before an operator does not end the scan", () => {
  assert.equal(headCommand("cd /repo \\\n  && pnpm build"), "pnpm");
  assert.equal(headCommand("export FOO=1 \\\n && git status"), "git");
});

test("a shell builtin is never reported as a program", () => {
  // `Bash: export` was the #6 bar at 215 live calls — a builtin, not a
  // program, hiding git/echo/cat/gh behind an env-setup prefix.
  assert.equal(headCommand('export PATH="$HOME/.nvm/bin:$PATH"; git status'), "git");
  assert.equal(headCommand("export FOO=1 && pnpm build"), "pnpm");
  assert.equal(headCommand("source ~/.bashrc && node x.js"), "node");
  assert.equal(headCommand("export PATH=/x"), null, "a bare builtin is not a program");
  assert.equal(headCommand("cd /x; shift; ls"), "ls");
  assert.equal(headCommand("read -r x; git status"), "git");
});

test("a standalone assignment is a statement, not a prefix", () => {
  // `FOO=bar;git status` reported "status" — a fragment of the VALUE.
  assert.equal(headCommand("FOO=bar;git status"), "git");
  assert.equal(headCommand("MB=$(git merge-base origin/dev HEAD) && echo $MB"), "echo");
  assert.equal(headCommand('DEB="/x/Agent Office_0.1.2.deb"; ls "$DEB"'), "ls");
});

test("env assignments and wrappers are peeled", () => {
  assert.equal(headCommand("NODE_OPTIONS=--max-old-space-size=8192 pnpm build"), "pnpm");
  assert.equal(headCommand("sudo pacman -U pkg.tar.zst"), "pacman");
  assert.equal(headCommand("nohup pnpm dev"), "pnpm");
  assert.equal(headCommand("timeout 90 claude -p x"), "claude", "timeout is a wrapper, like nohup");
  assert.equal(headCommand("timeout 5m pnpm test"), "pnpm");
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

test("the scan is bounded, and gives up rather than grinding", () => {
  // "it did not hang" proves nothing — the scan terminates regardless. The cap
  // bounds CHAINED PREFIXES, and its observable price is that an absurd chain
  // reports nothing. Pin that, or the cap can be deleted unnoticed.
  const chain = (n: number) =>
    Array.from({ length: n }, (_, i) => `V${i}=1`).join(" ") + " git status";
  assert.equal(headCommand(chain(5)), "git", "a realistic chain still resolves");
  assert.equal(headCommand(chain(40)), null, "past the cap it gives up rather than guessing");

  // Deep nesting is handled by the tokenizer, not the cap, so it stays correct
  // AND fast — these come from agent output and must not stall the request.
  const started = Date.now();
  assert.equal(headCommand("(".repeat(20_000) + "git status"), "git");
  assert.equal(headCommand("cd " + "$(".repeat(5_000) + "x" + ")".repeat(5_000) + " && git x"), "git");
  assert.ok(Date.now() - started < 500, "hostile input stays fast");
});
