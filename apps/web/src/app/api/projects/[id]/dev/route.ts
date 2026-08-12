import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, basename, isAbsolute } from "node:path";
import * as net from "node:net";
import { NextResponse } from "next/server";
import { projects } from "@agent-office/domain/services";
import { validateIdParam, notFound } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export type DetectedCommand = {
  key: string;
  name: string;
  argv: string[];
  portMode: "next" | "flutter" | "env" | "device";
  cwd?: string; // override project root (e.g. nested Flutter app)
};

// Module-level set prevents two concurrent POST requests from picking the same port
// in the window between "port is free" check and the process actually binding it.
const reservedPorts = new Set<number>();

async function findFreePort(start = 3001): Promise<number> {
  for (let p = start; p < start + 100; p++) {
    if (p === 5173) continue;
    if (reservedPorts.has(p)) continue;
    const free = await new Promise<boolean>((resolve) => {
      const s = net.createServer();
      s.once("error", () => resolve(false));
      s.once("listening", () => { s.close(() => resolve(true)); });
      s.listen(p, "127.0.0.1");
    });
    if (free) {
      reservedPorts.add(p);
      // Release the reservation after 30 s — by then the process has bound the port
      // (or failed), so subsequent findFreePort calls won't see it as free anyway.
      setTimeout(() => reservedPorts.delete(p), 30_000);
      return p;
    }
  }
  throw new Error("No free port found in range 3001–3100");
}

function detectPackageManager(cwd: string): string {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) return "bun";
  return "npm";
}

const DEV_SCRIPT_RE = /^(dev|start|serve|preview|watch|develop)([:.-].+)?$/;
const SKIP_SCRIPT_RE = /build|test|lint|type|check|emit|prepare|postinstall|prebuild/;

function scriptToName(key: string): string {
  if (key === "dev") return "Dev";
  if (key === "start") return "Start";
  if (key === "serve") return "Serve";
  if (key === "preview") return "Preview";
  return key.replace(/^(dev|start)[.:-]/, "").replace(/[-:]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// Scan a single directory's package.json for dev-style scripts. When `opts` is
// given the dir is a subfolder (e.g. frontend/), so keys/names are prefixed to
// stay unique and a `cwd` override is attached so it spawns in that subfolder.
function collectPkgCommands(
  dir: string,
  opts?: { keyPrefix: string; namePrefix: string },
): DetectedCommand[] {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return [];
  const out: DetectedCommand[] = [];
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const isNextJs = "next" in allDeps;
    const scripts = pkg.scripts ?? {};
    const pm = detectPackageManager(dir);

    // Sort so bare "dev"/"start" come before "dev:*"
    const keys = Object.keys(scripts).sort((a, b) => {
      const aBase = !a.includes(":") && !a.includes("-");
      const bBase = !b.includes(":") && !b.includes("-");
      return aBase === bBase ? a.localeCompare(b) : aBase ? -1 : 1;
    });

    for (const key of keys) {
      if (!DEV_SCRIPT_RE.test(key)) continue;
      if (SKIP_SCRIPT_RE.test(key)) continue;
      const isThisNext = isNextJs && (key === "dev" || key === "start");
      out.push({
        key: opts ? `${opts.keyPrefix}-${key}` : key,
        name: opts ? `${opts.namePrefix} · ${scriptToName(key)}` : scriptToName(key),
        argv: [pm, "run", key],
        portMode: isThisNext ? "next" : "env",
        ...(opts ? { cwd: dir } : {}),
      });
    }
  } catch { /* ignore */ }
  return out;
}

function detectDevCommands(cwd: string): DetectedCommand[] {
  // 1. .ao.json custom override - takes full priority
  const aoPath = join(cwd, ".ao.json");
  if (existsSync(aoPath)) {
    try {
      const cfg = JSON.parse(readFileSync(aoPath, "utf8")) as {
        devCommands?: Array<{ name: string; cmd: string }>;
      };
      if (Array.isArray(cfg.devCommands) && cfg.devCommands.length > 0) {
        return cfg.devCommands
          .filter((c) => typeof c.name === "string" && typeof c.cmd === "string")
          .map((c) => ({
            key: c.name.toLowerCase().replace(/\s+/g, "-"),
            name: c.name,
            argv: c.cmd.trim().split(/\s+/),
            portMode: "env" as const,
          }));
      }
    } catch { /* ignore */ }
  }

  const commands: DetectedCommand[] = [];

  // 2. Flutter - check root and common monorepo subfolders (apps/*, mobile/*, packages/*)
  const flutterCandidates: Array<{ dir: string; label: string }> = [
    { dir: cwd, label: "Flutter Web" },
  ];
  try {
    for (const parent of ["apps", "mobile", "packages"]) {
      const parentDir = join(cwd, parent);
      if (!existsSync(parentDir)) continue;
      for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        flutterCandidates.push({ dir: join(parentDir, entry.name), label: `Flutter - ${entry.name}` });
      }
    }
  } catch { /* ignore */ }

  for (const { dir, label } of flutterCandidates) {
    if (!existsSync(join(dir, "pubspec.yaml"))) continue;
    const key = dir === cwd ? "flutter" : `flutter-${dir.split("/").pop()}`;
    const isMobileApp = existsSync(join(dir, "android")) || existsSync(join(dir, "ios"));
    commands.push({
      key,
      name: label,
      argv: isMobileApp ? ["flutter", "run"] : ["flutter", "run", "-d", "web"],
      portMode: isMobileApp ? "device" : "flutter",
      cwd: dir,
    });
  }

  // 3. package.json scripts — root, plus the single-app subfolders the project
  // bootstrapper emits (frontend/, backend/) and other common layouts. Each
  // subfolder carries its own cwd so it spawns in the right directory.
  commands.push(...collectPkgCommands(cwd));
  for (const sub of ["frontend", "backend", "web", "client", "server", "api"]) {
    const subDir = join(cwd, sub);
    if (existsSync(join(subDir, "package.json"))) {
      const label = sub.charAt(0).toUpperCase() + sub.slice(1);
      commands.push(...collectPkgCommands(subDir, { keyPrefix: sub, namePrefix: label }));
    }
  }

  return commands;
}

let _cachedTerminal: string | null | undefined = undefined;

function detectTerminal(): string | null {
  if (_cachedTerminal !== undefined) return _cachedTerminal;
  const names = ["gnome-terminal", "ptyxis", "xterm", "x-terminal-emulator", "konsole", "xfce4-terminal", "alacritty", "kitty"];
  for (const name of names) {
    try {
      const p = execFileSync("which", [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (p) { _cachedTerminal = p; return p; }
    } catch { /* not found */ }
  }
  _cachedTerminal = null;
  return null;
}

const safeArg = (a: string) => `'${a.replace(/'/g, "'\\''")}'`;

function spawnInTerminal(title: string, cwd: string, argv: string[], port: number | null) {
  const portExport = port !== null ? `export PORT=${port}; ` : "";
  const cmdStr = argv.map(safeArg).join(" ");

  // Terminals start bash with a minimal PATH that often lacks nvm/pnpm/bun.
  // Explicitly prepend the canonical install locations so package managers are
  // found even when the terminal's login/rc files haven't been sourced.
  //
  // Sourcing nvm.sh alone isn't enough: nvm only puts a node version on PATH
  // if the user has a default alias pointing at an installed version. When the
  // default is stale (e.g. `lts/*` with no LTS installed) `nvm.sh` loads but
  // node/npm/pnpm stay missing. Try to `nvm use` a real version as a safety
  // net so a broken alias never wedges the launch.
  const pathSetup = [
    '[ -d "$HOME/.local/share/pnpm" ] && export PATH="$HOME/.local/share/pnpm:$PATH"',
    'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"',
    'command -v nvm >/dev/null && { nvm use default >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || nvm use --lts >/dev/null 2>&1 || true; }',
    '[ -d "$HOME/.bun/bin" ] && export PATH="$HOME/.bun/bin:$PATH"',
  ].join("; ") + "; ";

  const shell = `${pathSetup}${portExport}cd ${safeArg(cwd)} && ${cmdStr}; echo; read -rp $'\\nProcess ended (exit $?). Press Enter to close...'`;

  // Pass the server's PATH through but strip Next.js standalone internals —
  // __NEXT_PRIVATE_STANDALONE_CONFIG carries an empty distDir that makes
  // Turbopack crash, and NODE_ENV=production causes "non-standard NODE_ENV"
  // warnings + wrong behaviour in child dev servers.
  const cleanEnv = {} as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith("__NEXT_")) continue;
    if (k === "NODE_ENV") continue;
    cleanEnv[k] = v;
  }
  const spawnEnv = { ...cleanEnv, ...(port !== null ? { PORT: String(port) } : {}) };

  const termBin = detectTerminal();
  if (!termBin) {
    // Fallback: run directly (no visible terminal)
    const [bin, ...args] = argv;
    const child = spawn(bin!, args, { cwd, env: spawnEnv, detached: true, stdio: "ignore" });
    child.unref();
    return child;
  }

  const termName = basename(termBin);
  let termArgs: string[];
  if (termName === "gnome-terminal") {
    termArgs = ["--wait", "--title", title, "--", "bash", "-c", shell];
  } else if (termName === "ptyxis") {
    termArgs = ["--", "bash", "-c", shell];
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

  const child = spawn(termBin, termArgs, { detached: true, stdio: "ignore", env: spawnEnv });
  child.unref();
  return child;
}

export async function GET(_req: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;

  const project = projects.readProject(id);
  if (!project) return notFound();

  const cwd = project.meta.cwd;
  if (!cwd || !isAbsolute(cwd) || !existsSync(cwd)) {
    return NextResponse.json({ hasNodeModules: false, pm: "npm", commands: [] });
  }

  const pm = detectPackageManager(cwd);
  const commands = detectDevCommands(cwd);
  // Report package.json/node_modules presence from wherever the dev commands
  // actually live (root, or a frontend/ subfolder for bootstrapped projects),
  // so the Install button and button-visibility logic stay accurate.
  const primaryDir = commands[0]?.cwd ?? cwd;
  const hasPackageJson = existsSync(join(primaryDir, "package.json")) || existsSync(join(cwd, "package.json"));
  const hasNodeModules = existsSync(join(primaryDir, "node_modules"));
  return NextResponse.json({ hasPackageJson, hasNodeModules, pm, commands });
}

export async function POST(req: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;

  const project = projects.readProject(id);
  if (!project) return notFound();

  const cwd = project.meta.cwd;
  if (!cwd || !isAbsolute(cwd) || !existsSync(cwd)) {
    return NextResponse.json({ error: "Working directory not found" }, { status: 400 });
  }

  let body: { commandKey?: string } = {};
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try { body = await req.json() as { commandKey?: string }; } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
  }
  const commands = detectDevCommands(cwd);

  const command = (body.commandKey ? commands.find((c) => c.key === body.commandKey) : null) ?? commands[0];
  if (!command) {
    return NextResponse.json({ error: "No dev commands detected for this project" }, { status: 400 });
  }

  const needsPort = command.portMode !== "device";
  const port = needsPort ? await findFreePort(3001) : 0;
  const argv = [...command.argv];
  // "next" portMode uses PORT env var (exported via portExport in spawnInTerminal) —
  // appending `-- -p port` breaks Next.js ≥ v13 which treats `--` as a directory argument.
  if (command.portMode === "flutter") argv.push("--web-port", String(port));

  const cmdCwd = command.cwd ?? cwd;
  const child = spawnInTerminal(command.name, cmdCwd, argv, needsPort ? port : null);

  return NextResponse.json({ key: command.key, port: needsPort ? port : null, url: needsPort ? `http://localhost:${port}` : null, pid: child.pid });
}
