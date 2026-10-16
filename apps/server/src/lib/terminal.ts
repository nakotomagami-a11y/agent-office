// Run a command in a new OS terminal window (or detached if no terminal is found).
// Shared by the build and dev routes. The nvm-safe PATH setup guards against a
// stale default nvm alias (e.g. `lts/*` with no LTS installed) leaving node/npm/
// pnpm off PATH in the spawned shell, since terminals start bash with a minimal PATH.
import { spawn, execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { log } from "@agent-office/domain/services/infra/log";
import { isPidAlive } from "@agent-office/domain/services/infra/pid";

const shellQuote = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`;

// Single-instance terminals (ptyxis, gnome-terminal, macOS Terminal) exit after handing
// off the window, so the pid we track is the one the shell inside it reports.
const PID_WAIT_MS = 10_000;
// A cold PowerShell start plus an antivirus scan can take seconds; timing out after
// Start-Process ran would leave an untracked window, and a retry opens a duplicate.
const POWERSHELL_WAIT_MS = 30_000;

declare global {
  var __aoLaunchedShells: Set<number> | undefined;
  var __aoShellExitFiles: Map<number, string> | undefined;
  var __aoExitedShells: Set<number> | undefined;
}
const launched = (globalThis.__aoLaunchedShells ??= new Set<number>());
// The window outlives its command, so the shell's pid outlives a crashed server: the shell touches
// a marker on exit instead, recorded once seen so every later poll (another tab, a retry) agrees.
const exitFiles = (globalThis.__aoShellExitFiles ??= new Map<number, string>());
const exited = (globalThis.__aoExitedShells ??= new Set<number>());

// One subdir per server: servers share tmpdir, and a dead server's markers are unread.
const EXIT_ROOT = join(tmpdir(), "ao-term-exit");
let exitDir: string | undefined;

function serverExitDir(): string {
  if (!exitDir) {
    mkdirSync(EXIT_ROOT, { recursive: true });
    for (const name of readdirSync(EXIT_ROOT)) {
      const owner = Number(name);
      if (owner !== process.pid && !isPidAlive(owner)) removeQuietly(join(EXIT_ROOT, name));
    }
    exitDir = join(EXIT_ROOT, String(process.pid));
  }
  // Every call: a %TEMP% cleaned while we run would otherwise leave nowhere to write the marker.
  mkdirSync(exitDir, { recursive: true });
  return exitDir;
}

function removeQuietly(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 3 });
  } catch (err) {
    log.warn("terminal.exit_marker_cleanup_failed", { path, message: (err as Error).message });
  }
}

/** Whether `pid` is a terminal shell this server launched, so stopping it may take its tree. */
export function isLaunchedShell(pid: number): boolean {
  return launched.has(pid);
}

export function hasShellCommandExited(pid: number): boolean {
  if (exited.has(pid)) return true;
  const file = exitFiles.get(pid);
  if (file === undefined || !existsSync(file)) return false;
  exited.add(pid);
  exitFiles.delete(pid);
  removeQuietly(file);
  return true;
}

export function forgetLaunchedShell(pid: number): void {
  launched.delete(pid);
  exited.delete(pid);
  const file = exitFiles.get(pid);
  exitFiles.delete(pid);
  if (file) removeQuietly(file);
}

let cachedTerminal: string | null | undefined;

function detectTerminal(): string | null {
  if (cachedTerminal !== undefined) return cachedTerminal;
  const names = ["gnome-terminal", "ptyxis", "xterm", "x-terminal-emulator", "konsole", "xfce4-terminal", "alacritty", "kitty"];
  for (const name of names) {
    try {
      const p = execFileSync("which", [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (p) return (cachedTerminal = p);
    } catch { /* not found */ }
  }
  return (cachedTerminal = null);
}

// This server's own identity. An Agent Office started from here would advertise our URL
// (AO_BASE_URL outranks PORT), send its agents' permission callbacks to us, and read our bundle.
const SERVER_IDENTITY_VARS = new Set(["AO_BASE_URL", "AO_RUN_ID", "AO_BUNDLE_ROOT", "AO_SERVER_PORT", "PORT"]);

/** Env for the spawned terminal — drop Next-internal vars so the child shell is
 *  clean (`__NEXT_PRIVATE_STANDALONE_CONFIG` crashes Turbopack; `NODE_ENV=production`
 *  breaks child dev servers), then inject PORT when one is given. */
function spawnEnv(port: number | null): NodeJS.ProcessEnv {
  const env = {} as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith("__NEXT_")) continue;
    if (k === "NODE_ENV") continue;
    if (SERVER_IDENTITY_VARS.has(k.toUpperCase())) continue;
    env[k] = v;
  }
  if (port !== null) env.PORT = String(port);
  return env;
}

const NVM_SAFE_PATH_SETUP = [
  '[ -d "$HOME/.local/share/pnpm" ] && export PATH="$HOME/.local/share/pnpm:$PATH"',
  'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"',
  'command -v nvm >/dev/null && { nvm use default >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || nvm use --lts >/dev/null 2>&1 || true; }',
  '[ -d "$HOME/.bun/bin" ] && export PATH="$HOME/.bun/bin:$PATH"',
];

/** Run `argv` in a new terminal window at `cwd` that stays open after exit, with PORT
 *  set when given. Resolves to the pid of the shell in that window, or null if none came up. */
export async function spawnInTerminal(title: string, cwd: string, argv: string[], port: number | null = null): Promise<number | null> {
  // A shell whose window closed unpolled is never forgotten by GET; its pid may now be anyone's.
  for (const old of launched) if (!isPidAlive(old)) forgetLaunchedShell(old);
  let exitFile: string | undefined;
  let pid: number | null = null;
  try {
    exitFile = join(serverExitDir(), randomUUID());
    pid = process.platform === "win32"
      ? await spawnWindows(title, cwd, argv, spawnEnv(port), exitFile)
      : await spawnPosix(title, cwd, argv, spawnEnv(port), exitFile);
  } catch (err) {
    log.error("terminal.spawn_failed", { title, cwd, message: (err as Error).message });
  } finally {
    if (pid === null && exitFile) removeQuietly(exitFile);
  }
  if (pid === null || !exitFile) return null;
  forgetLaunchedShell(pid); // a reused pid's leftovers
  launched.add(pid);
  exitFiles.set(pid, exitFile);
  return pid;
}

// `start`'s pid is a helper that exits at once; Start-Process returns the console cmd.
// Values go in env vars, not script text: PowerShell quotes include `’` and `[` is a wildcard.
// cmd expands %VAR% even inside quotes, so quoting here does not neutralise `%`.
// Own `cmd /c`: Ctrl+C then Y on a .cmd shim drops the rest of its line, marker included. `!AO_TERM_CMD!`
// expands after the outer line is split on `&`, so only the inner cmd parses the command's quoting.
const START_CONSOLE = "$ProgressPreference='SilentlyContinue'; (Start-Process -FilePath cmd.exe -ArgumentList $env:AO_TERM_ARGS -WorkingDirectory ([WildcardPattern]::Escape($env:AO_TERM_CWD)) -PassThru).Id";

function spawnWindows(title: string, cwd: string, argv: string[], env: NodeJS.ProcessEnv, exitFile: string): Promise<number | null> {
  const winArg = (a: string) => (/[\s"&|<>^()!]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);
  const cmdLine = `/v:on /s /k "title ${title.replace(/[&|<>^"%!]/g, "")}&cmd /d /s /c "!AO_TERM_CMD!"&type nul>"%AO_TERM_EXIT%""`;
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", START_CONSOLE],
      { env: { ...env, AO_TERM_ARGS: cmdLine, AO_TERM_CMD: argv.map(winArg).join(" "), AO_TERM_CWD: cwd, AO_TERM_EXIT: exitFile }, windowsHide: true, timeout: POWERSHELL_WAIT_MS },
      (err, stdout, stderr) => {
        const pid = parseInt(String(stdout).trim(), 10);
        if (err?.killed) {
          log.error("terminal.start_timeout", { title, cwd, terminal: "win32", note: "the console may be open, untracked" });
          resolve(null);
        } else if (err || !(pid > 0)) {
          log.error("terminal.spawn_failed", { title, cwd, message: err?.message ?? String(stderr).slice(0, 300) });
          resolve(null);
        } else resolve(pid);
      },
    );
  });
}

function terminalArgs(termBin: string, title: string, scriptFile: string): string[] {
  const run = ["bash", scriptFile];
  switch (basename(termBin)) {
    case "gnome-terminal": return ["--title", title, "--", ...run];
    case "ptyxis": return ["--", ...run];
    case "xterm": return ["-title", title, "-e", ...run];
    case "konsole": return ["--title", title, "-e", ...run];
    case "alacritty": return ["-T", title, "-e", ...run];
    case "kitty": return ["--title", title, ...run];
    // xfce4-terminal and some x-terminal-emulator targets take `-e` as one string.
    default: return ["-e", scriptFile];
  }
}

async function spawnPosix(title: string, cwd: string, argv: string[], env: NodeJS.ProcessEnv, exitFile: string): Promise<number | null> {
  const dir = mkdtempSync(join(tmpdir(), "ao-term-"));
  const pidFile = join(dir, "pid");
  // `.command` so macOS Terminal runs it when handed the file.
  const scriptFile = join(dir, "run.command");
  const cmdStr = argv.map((a) => (/[\s"'\\$`!]/.test(a) ? shellQuote(a) : a)).join(" ");
  writeFileSync(scriptFile, [
    "#!/bin/bash",
    `echo $$ > ${shellQuote(pidFile)} || exit 1`,
    ...NVM_SAFE_PATH_SETUP,
    ...(env.PORT ? [`export PORT=${env.PORT}`] : []),
    `cd ${shellQuote(cwd)} && ${cmdStr}`,
    "code=$?",
    `: > ${shellQuote(exitFile)}`,
    'echo; echo "Process ended (exit $code)."; read -rp "Press Enter to close..."',
    "",
  ].join("\n"));
  chmodSync(scriptFile, 0o755);

  let launchFailed = false;
  let settled = false;
  const launch = (bin: string, args: string[]) => {
    const child = spawn(bin, args, { cwd, env, detached: true, stdio: "ignore" });
    // Unhandled, a missing binary's async ENOENT crashes the server.
    child.on("error", (err) => { launchFailed = true; log.error("terminal.spawn_failed", { title, message: err.message }); });
    // Handoff clients exit 0; non-zero is e.g. no DISPLAY (headless, the shell exits once settled).
    child.on("exit", (code) => { if (code && !settled) { launchFailed = true; log.error("terminal.launcher_exit", { title, bin, code }); } });
    child.unref();
  };

  // AO_TERMINAL=none runs headless, so tests never open a window or need a display.
  const headless = process.env.AO_TERMINAL === "none";
  const termBin = headless || process.platform === "darwin" ? null : detectTerminal();
  if (!headless && process.platform === "darwin") launch("open", ["-a", "Terminal", scriptFile]);
  else if (!termBin) launch("bash", [scriptFile]);
  else launch(termBin, terminalArgs(termBin, title, scriptFile));

  try {
    for (let waited = 0; waited < PID_WAIT_MS; waited += 100) {
      await sleep(100);
      let pid = NaN;
      try { pid = parseInt(readFileSync(pidFile, "utf8"), 10); } catch { /* not written yet */ }
      if (pid > 0) return pid;
      if (launchFailed) return null;
    }
    log.error("terminal.start_timeout", { title, cwd, terminal: termBin ?? process.platform });
    return null;
  } finally {
    settled = true;
    // bash holds the script open, so removing it from under a running shell is safe.
    rmSync(dir, { recursive: true, force: true });
  }
}
