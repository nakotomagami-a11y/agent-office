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
// gh config (paths.ts ghConfigDir): else tests read the developer's real gh login. APPDATA is
// overridden, not deleted — without it Windows falls to a different branch than real users take.
// NODE_ENV is pinned, not inherited: an agent running the suite from inside the
// packaged app inherits NODE_ENV=production, and every forbidInProd() route then
// 404s. That reddened the dev-seed test for agents only — CI, where NODE_ENV is
// unset, stayed green, so the failure looked like the agent's own diff.
const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: join(home, "AppData", "Roaming"), NODE_ENV: "test" };
const dropped = ["AO_BASE_URL", "AO_RUN_ID", "AO_BUNDLE_ROOT", "PORT", "CLAUDE_CONFIG_DIR", "GH_CONFIG_DIR", "XDG_CONFIG_HOME"];
for (const key of dropped) delete env[key];

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
