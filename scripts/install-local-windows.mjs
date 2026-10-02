/**
 * Build the current working tree into an NSIS installer and run it, so the
 * installed app reflects local source. The Windows counterpart of
 * install-local.sh; invoked via `pnpm install:local:windows`.
 *
 * Three quirks of this project's Tauri build, two shared with the .deb script:
 *
 *   1. `tauri build` exits non-zero at the very end on the updater-signing step
 *      (no TAURI_SIGNING_PRIVATE_KEY locally) — the installer is already
 *      written by then, so success is judged by a FRESH artifact appearing,
 *      not by the exit code.
 *   2. `--bundles nsis` only: tauri.windows.conf.json also lists msi, and WiX
 *      recompresses the whole multi-GB payload for an artifact we never ship
 *      (the updater's `installMode: passive` is NSIS-only).
 *   3. The installer KILLS the running app before replacing it. Agent Office
 *      hosts its own agent runs, so an agent that runs this script terminates
 *      the server recording its own work and dies mid-task with exit -1. Hence
 *      the running-app check below, before the build rather than after it:
 *      refusing after a ten-minute build would be useless.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = join(repoRoot, "apps", "web");
const nsisDir = join(webDir, "src-tauri", "target", "release", "bundle", "nsis");
const installedExe = join(process.env.LOCALAPPDATA ?? "", "Agent Office", "app.exe");
const force = process.argv.includes("--force");

function runningPids() {
  try {
    const out = execFileSync("tasklist", ["/fi", "imagename eq app.exe", "/fo", "csv", "/nh"], { encoding: "utf8" });
    return [...out.matchAll(/^"app\.exe","(\d+)"/gm)].map((m) => m[1]);
  } catch {
    return [];
  }
}

const pids = runningPids();
if (pids.length > 0 && !force) {
  console.error(
    `Agent Office is running (app.exe PID ${pids.join(", ")}).\n` +
    "The installer terminates it, which kills every agent run it is hosting —\n" +
    "including your own if you are an agent executing this script.\n" +
    "Close the app and re-run, or pass --force if you accept that.",
  );
  process.exit(1);
}

const startedAt = Date.now();
console.log(`==> Building Agent Office from working tree: ${repoRoot}`);
spawnSync("pnpm", ["tauri", "build", "--bundles", "nsis"], { cwd: webDir, stdio: "inherit", shell: true });

const fresh = existsSync(nsisDir)
  ? readdirSync(nsisDir)
      .filter((f) => f.endsWith("-setup.exe"))
      .map((f) => join(nsisDir, f))
      .filter((p) => statSync(p).mtimeMs > startedAt)
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
  : undefined;

if (!fresh) {
  console.error("==> ERROR: no fresh installer was produced — the build genuinely failed. Not installing.");
  process.exit(1);
}

console.log(`==> Installing: ${fresh}`);
// /S is NSIS silent mode. The installer relaunches the app itself when done.
const install = spawnSync(fresh, ["/S"], { stdio: "inherit" });
if (install.status !== 0) {
  console.error(`==> ERROR: installer exited ${install.status}`);
  process.exit(1);
}

console.log(`==> Installed. ${installedExe} is now dated ${statSync(installedExe).mtime.toISOString()}`);
