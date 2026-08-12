import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, basename, isAbsolute } from "node:path";
import { NextResponse } from "next/server";
import { projects } from "@agent-office/domain/services";
import { validateIdParam, notFound } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

function detectPackageManager(cwd: string): string {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) return "bun";
  return "npm";
}

function detectTerminal(): string | null {
  const names = ["gnome-terminal", "xterm", "x-terminal-emulator", "konsole", "xfce4-terminal", "alacritty", "kitty"];
  for (const name of names) {
    try {
      const p = execFileSync("which", [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (p) return p;
    } catch { /* not found */ }
  }
  return null;
}

const shellQuote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

function cleanEnv(): NodeJS.ProcessEnv {
  const env = {} as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith("__NEXT_")) continue;
    if (k === "NODE_ENV") continue;
    env[k] = v;
  }
  return env;
}

function spawnInTerminal(title: string, cwd: string, argv: string[]) {
  const cmdStr = argv.map((a) => /[\s"'\\$`!]/.test(a) ? shellQuote(a) : a).join(" ");
  // Same nvm-safe path setup as `dev/route.ts` — see the comment there for
  // why sourcing nvm.sh alone isn't enough. A stale default alias (`lts/*`
  // with no LTS installed) leaves node/npm/pnpm off PATH; the `nvm use`
  // chain is a defensive fallback.
  const pathSetup = [
    '[ -d "$HOME/.local/share/pnpm" ] && export PATH="$HOME/.local/share/pnpm:$PATH"',
    'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"',
    'command -v nvm >/dev/null && { nvm use default >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || nvm use --lts >/dev/null 2>&1 || true; }',
    '[ -d "$HOME/.bun/bin" ] && export PATH="$HOME/.bun/bin:$PATH"',
  ].join("; ") + "; ";
  const shell = `${pathSetup}cd ${shellQuote(cwd)} && ${cmdStr}; echo; read -rp $'\\nProcess ended (exit $?). Press Enter to close...'`;

  const env = cleanEnv();
  const termBin = detectTerminal();
  if (!termBin) {
    const [bin, ...args] = argv;
    const child = spawn(bin!, args, { cwd, env, detached: true, stdio: "ignore" });
    child.unref();
    return child;
  }

  const termName = basename(termBin);
  let termArgs: string[];
  if (termName === "gnome-terminal") {
    termArgs = ["--wait", "--title", title, "--", "bash", "-c", shell];
  } else if (termName === "xterm") {
    termArgs = ["-title", title, "-e", "bash", "-c", shell];
  } else if (termName === "konsole") {
    termArgs = ["--hold", "--title", title, "-e", "bash", "-c", shell];
  } else if (termName === "alacritty") {
    termArgs = ["-T", title, "-e", "bash", "-c", shell];
  } else if (termName === "kitty") {
    termArgs = ["--title", title, "bash", "-c", shell];
  } else {
    termArgs = ["-e", "bash", "-c", shell];
  }

  const child = spawn(termBin, termArgs, { env, detached: true, stdio: "ignore" });
  child.unref();
  return child;
}

const BUILD_SCRIPT_PRIORITY = ["build", "build:prod", "build:production", "build:web", "build:app"];

function detectBuildCommand(cwd: string, pm: string): string[] | null {
  const aoPath = join(cwd, ".ao.json");
  if (existsSync(aoPath)) {
    try {
      const cfg = JSON.parse(readFileSync(aoPath, "utf8")) as { buildCommand?: string };
      if (typeof cfg.buildCommand === "string") return cfg.buildCommand.trim().split(/\s+/);
    } catch { /* ignore */ }
  }

  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
      const scripts = pkg.scripts ?? {};
      for (const key of BUILD_SCRIPT_PRIORITY) {
        if (scripts[key]) return [pm, "run", key];
      }
      const fallback = Object.keys(scripts).find((k) => /^build/.test(k));
      if (fallback) return [pm, "run", fallback];
    } catch { /* ignore */ }
  }

  return null;
}

export async function GET(_req: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;

  const project = projects.readProject(id);
  if (!project) return notFound();

  const cwd = project.meta.cwd;
  if (!cwd || !isAbsolute(cwd) || !existsSync(cwd)) return NextResponse.json({ hasBuild: false });

  const pm = detectPackageManager(cwd);
  const argv = detectBuildCommand(cwd, pm);
  return NextResponse.json({ hasBuild: !!argv });
}

export async function POST(_req: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;

  const project = projects.readProject(id);
  if (!project) return notFound();

  const cwd = project.meta.cwd;
  if (!cwd || !isAbsolute(cwd) || !existsSync(cwd)) {
    return NextResponse.json({ error: "Working directory not found" }, { status: 400 });
  }

  const pm = detectPackageManager(cwd);
  const argv = detectBuildCommand(cwd, pm);
  if (!argv) {
    return NextResponse.json({ error: "No build command detected" }, { status: 400 });
  }

  const child = spawnInTerminal("Build", cwd, argv);
  return NextResponse.json({ pid: child.pid ?? null });
}
