#!/usr/bin/env node
/**
 * Runs a package's node:test files against a throwaway home directory.
 *
 * Tests resolve ~/.claude through os.homedir(), which reads HOME on POSIX but
 * USERPROFILE on Windows. Setting only HOME once ran the suite against a real
 * user's ~/.claude on Windows and deleted their installed skills, so both are
 * set here, for every file. Also replaces `tsx --test $(find ...)`, which
 * Windows' cmd never expanded: that ran zero tests and reported a pass.
 *
 * Variables that point at the live app are dropped too: an agent running
 * `pnpm test` inside Agent Office inherits them, and a test must never reach it.
 *
 *   node ../../scripts/run-tests.mjs                  # unit tests (no *e2e*, in every package)
 *   node ../../scripts/run-tests.mjs --e2e            # only *e2e* files
 *   node ../../scripts/run-tests.mjs src/a.test.ts    # explicit files
 */
import { spawnSync } from "node:child_process";
import { globSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const args = process.argv.slice(2);
const e2e = args.includes("--e2e");
const explicit = args.filter((a) => a !== "--e2e");
const files = explicit.length
  ? explicit
  : globSync("src/**/*.test.{ts,tsx}").filter((f) => basename(f).includes("e2e") === e2e).sort();

if (files.length === 0) {
  console.error("run-tests: no test files matched");
  process.exit(1);
}

const tsxCli = createRequire(join(process.cwd(), "package.json")).resolve("tsx/cli");
const home = mkdtempSync(join(tmpdir(), "ao-test-home-"));
const env = { ...process.env, HOME: home, USERPROFILE: home };
for (const key of ["AO_BASE_URL", "AO_RUN_ID", "AO_BUNDLE_ROOT", "PORT", "CLAUDE_CONFIG_DIR"]) delete env[key];

const result = spawnSync(process.execPath, [tsxCli, "--test", ...files], { stdio: "inherit", env });
if (result.error) console.error("run-tests: could not start the test runner:", result.error);
if (result.signal) console.error("run-tests: test runner killed by", result.signal);
try {
  rmSync(home, { recursive: true, force: true });
} catch (err) {
  // A test still holding a file open on Windows must not mask the test result.
  console.warn(`run-tests: left temp home ${home}: ${err.code ?? err}`);
}
process.exit(result.status ?? 1);
