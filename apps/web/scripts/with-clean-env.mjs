/**
 * Run a command with the named environment variables removed, and optionally
 * with others set.
 *
 * `unset VAR; cmd` and `VAR=value cmd` are both POSIX shell syntax. pnpm runs
 * scripts through `script-shell`, which on Windows defaults to cmd.exe — there
 * `unset` is not a command, `;` is not a separator, and a leading `VAR=value`
 * is not an assignment, so the whole script dies before the build starts
 * ("'unset' is not recognized"). It only appeared to work here because this
 * machine has a user-level `script-shell=.../Git/bin/bash.exe`; a clean
 * checkout or a windows-latest CI runner has no such config.
 *
 * cross-spawn, not node:child_process, because the commands below (`next`,
 * `node`) resolve to npm-generated `.cmd` shims on Windows, which recent Node
 * refuses to spawn without `shell: true` — and `shell: true` concatenates an
 * args array unescaped.
 *
 * usage: node scripts/with-clean-env.mjs VAR[,VAR...] [--set VAR=value ...] -- <cmd> [args...]
 */
import spawn from "cross-spawn";

const [vars, ...rest] = process.argv.slice(2);

// `--set NAME=value`, repeatable, sits between the delete-list and the `--`.
// It exists because the POSIX `beforeBuildCommand` prefixes the build with
// NODE_OPTIONS=--max-old-space-size=8192 and the Windows override could not
// express that, so it silently shipped without it: `next build --webpack` then
// dies at the default ~4GB heap with "Ineffective mark-compacts near heap
// limit", several minutes into an otherwise clean build.
const assignments = [];
let cursor = 0;
for (; cursor < rest.length && rest[cursor] !== "--"; cursor++) {
  if (rest[cursor] !== "--set") break;
  const pair = rest[++cursor];
  if (pair === undefined) {
    console.error("with-clean-env: --set needs a NAME=value argument");
    process.exit(2);
  }
  assignments.push(pair);
}
const argv = rest[cursor] === "--" ? rest.slice(cursor + 1) : rest.slice(cursor);

if (!vars || argv.length === 0) {
  console.error("usage: node scripts/with-clean-env.mjs VAR[,VAR...] [--set VAR=value ...] -- <cmd> [args...]");
  process.exit(2);
}

for (const name of vars.split(",").filter(Boolean)) delete process.env[name];

for (const pair of assignments) {
  // indexOf, not split: a value may legitimately contain "=".
  const eq = pair.indexOf("=");
  if (eq < 1) {
    console.error(`with-clean-env: malformed --set "${pair}" (expected NAME=value)`);
    process.exit(2);
  }
  process.env[pair.slice(0, eq)] = pair.slice(eq + 1);
}

const result = spawn.sync(argv[0], argv.slice(1), { stdio: "inherit" });
if (result.error) {
  console.error(`with-clean-env: cannot run ${argv[0]}: ${result.error.message}`);
  process.exit(1);
}
// A signal-killed child reports status === null; surface that as a failure.
process.exit(result.status ?? 1);
