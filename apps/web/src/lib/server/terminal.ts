// Run a command in a new OS terminal window (or detached if no terminal is found).
// Shared by the build and dev routes. The nvm-safe PATH setup guards against a
// stale default nvm alias (e.g. `lts/*` with no LTS installed) leaving node/npm/
// pnpm off PATH in the spawned shell, since terminals start bash with a minimal PATH.
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { basename } from "node:path";

const shellQuote = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`;

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

/** Env for the spawned terminal — drop Next-internal vars so the child shell is
 *  clean (`__NEXT_PRIVATE_STANDALONE_CONFIG` crashes Turbopack; `NODE_ENV=production`
 *  breaks child dev servers), then inject PORT when one is given. */
function spawnEnv(port: number | null): NodeJS.ProcessEnv {
  const env = {} as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith("__NEXT_")) continue;
    if (k === "NODE_ENV") continue;
    env[k] = v;
  }
  if (port !== null) env.PORT = String(port);
  return env;
}

const NVM_SAFE_PATH_SETUP =
  [
    '[ -d "$HOME/.local/share/pnpm" ] && export PATH="$HOME/.local/share/pnpm:$PATH"',
    'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"',
    'command -v nvm >/dev/null && { nvm use default >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || nvm use --lts >/dev/null 2>&1 || true; }',
    '[ -d "$HOME/.bun/bin" ] && export PATH="$HOME/.bun/bin:$PATH"',
  ].join("; ") + "; ";

/** Run `argv` via bash in a new terminal window at `cwd`, keeping the window open
 *  after exit. Pass `port` to export PORT into the shell + env. Falls back to a
 *  detached background spawn when no terminal is found. */
export function spawnInTerminal(title: string, cwd: string, argv: string[], port: number | null = null): ChildProcess {
  const cmdStr = argv.map((a) => (/[\s"'\\$`!]/.test(a) ? shellQuote(a) : a)).join(" ");
  const portExport = port !== null ? `export PORT=${port}; ` : "";
  const shell = `${NVM_SAFE_PATH_SETUP}${portExport}cd ${shellQuote(cwd)} && ${cmdStr}; echo; read -rp $'\\nProcess ended (exit $?). Press Enter to close...'`;
  const env = spawnEnv(port);

  const termBin = detectTerminal();
  if (!termBin) {
    const [bin, ...args] = argv;
    const child = spawn(bin!, args, { cwd, env, detached: true, stdio: "ignore" });
    child.unref();
    return child;
  }

  const termName = basename(termBin);
  let termArgs: string[];
  switch (termName) {
    case "gnome-terminal": termArgs = ["--wait", "--title", title, "--", "bash", "-c", shell]; break;
    case "ptyxis": termArgs = ["--", "bash", "-c", shell]; break;
    case "xterm": termArgs = ["-title", title, "-e", "bash", "-c", shell]; break;
    case "konsole": termArgs = ["--hold", "--title", title, "-e", "bash", "-c", shell]; break;
    case "alacritty": termArgs = ["-T", title, "-e", "bash", "-c", shell]; break;
    case "kitty": termArgs = ["--title", title, "bash", "-c", shell]; break;
    default: termArgs = ["-e", "bash", "-c", shell];
  }

  const child = spawn(termBin, termArgs, { env, detached: true, stdio: "ignore" });
  child.unref();
  return child;
}
