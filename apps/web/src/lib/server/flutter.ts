// Flutter integration — server-side logic behind /api/flutter/*. Lives web-side
// (not in packages/domain) because it couples to the web process store; the routes
// are thin controllers that gate on the `flutter` integration and map these results
// to HTTP. Requires the host `flutter`, `adb`, and `scrcpy` binaries.
import { spawn, execFile, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, isAbsolute } from "node:path";
import { projects } from "@agent-office/domain/services";
import type { FlutterDevice } from "@agent-office/domain/types";
import { registerProcess, registerStdin, deleteStdin, appendLine, setExited } from "@/lib/server-process-store";

/** Discriminated result carrying an HTTP status the route maps directly. */
export type FlutterResult<T> = ({ ok: true } & T) | { ok: false; error: string; status: number };

// ─── Device listing (adb) ────────────────────────────────────────────────────

export function parseAdbDevices(output: string): FlutterDevice[] {
  const devices: FlutterDevice[] = [];
  const lines = output.split("\n").slice(1); // skip "List of devices attached"

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("*")) continue;

    // Format: "serial  status  [qualifiers...]"
    const match = trimmed.match(/^(\S+)\s+(device|offline|unauthorized|no permissions)\s*(.*)?$/);
    if (!match) continue;

    const id = match[1]!;
    const status = match[2] as FlutterDevice["status"];
    const qualifiers = match[3] ?? "";

    const modelMatch = qualifiers.match(/model:(\S+)/);
    const productMatch = qualifiers.match(/product:(\S+)/);
    const model = modelMatch ? modelMatch[1]!.replace(/_/g, " ") : id;
    const name = productMatch ? productMatch[1]!.replace(/_/g, " ") : model;

    devices.push({ id, name, model, status, transportType: id.includes(":") ? "tcp" : "usb" });
  }
  return devices;
}

export function listDevices(): Promise<{ available: boolean; devices: FlutterDevice[] }> {
  return new Promise((resolve) => {
    execFile("adb", ["devices", "-l"], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        const isNotFound = (err as NodeJS.ErrnoException).code === "ENOENT";
        resolve({ available: !isNotFound, devices: [] });
        return;
      }
      resolve({ available: true, devices: parseAdbDevices(stdout) });
    });
  });
}

// ─── Binary + project (pubspec) discovery ────────────────────────────────────

function findFlutterBin(): string {
  try {
    return execFileSync("which", ["flutter"], { encoding: "utf8" }).trim() || "flutter";
  } catch {
    return existsSync("/snap/bin/flutter") ? "/snap/bin/flutter" : "flutter";
  }
}

function findPubspecInMonorepoParent(parentDir: string): string | null {
  if (!existsSync(parentDir)) return null;
  try {
    for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(parentDir, entry.name);
      if (existsSync(join(dir, "pubspec.yaml"))) return dir;
    }
  } catch { /* ignore */ }
  return null;
}

function findPubspecDir(cwd: string): string | null {
  if (existsSync(join(cwd, "pubspec.yaml"))) return cwd;
  for (const sub of ["app", "mobile", "flutter", "client", "frontend"]) {
    const dir = join(cwd, sub);
    if (existsSync(join(dir, "pubspec.yaml"))) return dir;
  }
  for (const parent of ["apps", "packages"]) {
    const hit = findPubspecInMonorepoParent(join(cwd, parent));
    if (hit) return hit;
  }
  return null;
}

/** Resolve the directory to run `flutter run` in from a project or a custom path. */
export function resolveFlutterCwd(projectId?: string, customPath?: string): FlutterResult<{ cwd: string }> {
  if (customPath) {
    const expanded = customPath.replace(/^~(?=\/|$)/, homedir());
    if (!isAbsolute(expanded) || !existsSync(expanded)) return { ok: false, error: "custom path not found", status: 400 };
    if (!existsSync(join(expanded, "pubspec.yaml"))) return { ok: false, error: "no pubspec.yaml in custom path", status: 400 };
    return { ok: true, cwd: expanded };
  }
  if (!projectId) return { ok: false, error: "projectId or customPath required", status: 400 };
  const project = projects.readProject(projectId);
  if (!project) return { ok: false, error: "project not found", status: 404 };
  const cwd = project.meta.cwd;
  if (!cwd || !isAbsolute(cwd) || !existsSync(cwd)) return { ok: false, error: "working directory not found", status: 400 };
  const found = findPubspecDir(cwd);
  if (!found) {
    return { ok: false, error: `no pubspec.yaml found in ${cwd} — select a Flutter project in the office or use a custom path`, status: 400 };
  }
  return { ok: true, cwd: found };
}

// ─── Run lifecycle (one tracked `flutter run` per key) ───────────────────────

const flutterPids = new Map<string, number>();

/** Tracking key for a run — the project id, or `custom:<path>` for an ad-hoc dir. */
export function runTrackingKey(projectId?: string | null, customPath?: string | null): string | null {
  if (customPath) return `custom:${customPath}`;
  return projectId ?? null;
}

function killTracked(key: string): void {
  const pid = flutterPids.get(key);
  if (!pid) return;
  try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
  flutterPids.delete(key);
}

function attachListeners(child: ChildProcess, pid: number, key: string): void {
  child.stdout?.on("data", (data: Buffer) => {
    for (const line of data.toString().split("\n")) if (line.trim()) appendLine(pid, line);
  });
  child.stderr?.on("data", (data: Buffer) => {
    for (const line of data.toString().split("\n")) if (line.trim()) appendLine(pid, `[err] ${line}`);
  });
  child.on("exit", (code, signal) => {
    setExited(pid, code, signal);
    deleteStdin(pid);
    if (flutterPids.get(key) === pid) flutterPids.delete(key);
  });
}

export function startRun(opts: { projectId?: string; deviceId?: string; customPath?: string }): FlutterResult<{ pid: number; cwd: string }> {
  const trackingKey = opts.projectId ?? `custom:${opts.customPath ?? ""}`;
  const resolved = resolveFlutterCwd(opts.projectId, opts.customPath);
  if (!resolved.ok) return resolved;

  killTracked(trackingKey);

  const args = ["run", "--no-pub"];
  if (opts.deviceId) args.push("-d", opts.deviceId);

  const child = spawn(findFlutterBin(), args, {
    cwd: resolved.cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PATH: `/snap/bin:${process.env.PATH ?? ""}` },
  });
  if (!child.pid) return { ok: false, error: "failed to start flutter run", status: 500 };

  const pid = child.pid;
  flutterPids.set(trackingKey, pid);
  registerProcess(pid);
  if (child.stdin) registerStdin(pid, child.stdin);
  attachListeners(child, pid, trackingKey);

  return { ok: true, pid, cwd: resolved.cwd };
}

export function stopRun(key: string): { wasRunning: boolean; pid?: number } {
  const pid = flutterPids.get(key);
  if (!pid) return { wasRunning: false };
  try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
  flutterPids.delete(key);
  return { wasRunning: true, pid };
}

export function getRunStatus(key: string): { pid: number | null; alive: boolean } {
  const pid = flutterPids.get(key) ?? null;
  let alive = false;
  if (pid) {
    try { process.kill(pid, 0); alive = true; } catch { /* not alive */ }
  }
  return { pid, alive };
}

// ─── Device mirror (scrcpy, always-on-top window) ────────────────────────────

let mirrorPid: number | null = null;

export function startMirror(deviceId?: string): number | null {
  stopMirror();
  const args: string[] = [];
  if (deviceId) args.push("-s", deviceId);
  args.push("--always-on-top", "--window-title", "Phone Mirror");
  const child = spawn("scrcpy", args, { detached: true, stdio: "ignore", env: { ...process.env } });
  child.unref();
  mirrorPid = child.pid ?? null;
  return mirrorPid;
}

export function stopMirror(): void {
  if (mirrorPid !== null) {
    try { process.kill(mirrorPid, "SIGTERM"); } catch { /* already gone */ }
    mirrorPid = null;
  }
}

// ─── Screenshot (adb screencap → PNG) ────────────────────────────────────────

export function captureScreenshot(deviceId?: string): Promise<FlutterResult<{ png: Buffer }>> {
  const args: string[] = [];
  if (deviceId) args.push("-s", deviceId);
  args.push("exec-out", "screencap", "-p");

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const child = spawn("adb", args, { timeout: 12_000 });
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("close", (code) => {
      if (code !== 0 || chunks.length === 0) {
        resolve({ ok: false, error: "screencap failed", status: 500 });
        return;
      }
      const buf = Buffer.concat(chunks);
      if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
        resolve({ ok: false, error: "invalid image data", status: 500 });
        return;
      }
      resolve({ ok: true, png: buf });
    });
    child.on("error", () => resolve({ ok: false, error: "adb not found", status: 500 }));
  });
}
