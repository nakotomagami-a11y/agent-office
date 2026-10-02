/**
 * Run a command with the named environment variables removed.
 *
 * `unset VAR; cmd` is POSIX shell syntax. pnpm runs scripts through
 * `script-shell`, which on Windows defaults to cmd.exe — there `unset` is not
 * a command and `;` is not a separator, so the whole script dies before the
 * build starts ("'unset' is not recognized"). It only appeared to work here
 * because this machine has a user-level `script-shell=.../Git/bin/bash.exe`;
 * a clean checkout or a windows-latest CI runner has no such config.
 *
 * cross-spawn, not node:child_process, because the commands below (`next`,
 * `node`) resolve to npm-generated `.cmd` shims on Windows, which recent Node
 * refuses to spawn without `shell: true` — and `shell: true` concatenates an
 * args array unescaped.
 *
 * usage: node scripts/with-clean-env.mjs VAR[,VAR...] -- <cmd> [args...]
 */
import spawn from "cross-spawn";

const [vars, ...rest] = process.argv.slice(2);
const argv = rest[0] === "--" ? rest.slice(1) : rest;

if (!vars || argv.length === 0) {
  console.error("usage: node scripts/with-clean-env.mjs VAR[,VAR...] -- <cmd> [args...]");
  process.exit(2);
}

for (const name of vars.split(",").filter(Boolean)) delete process.env[name];

const result = spawn.sync(argv[0], argv.slice(1), { stdio: "inherit" });
if (result.error) {
  console.error(`with-clean-env: cannot run ${argv[0]}: ${result.error.message}`);
  process.exit(1);
}
// A signal-killed child reports status === null; surface that as a failure.
process.exit(result.status ?? 1);
