import { spawn, execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, isAbsolute } from "node:path";
import { NextResponse } from "next/server";
import { projects } from "@agent-office/domain/services";
import { registerProcess, registerStdin, deleteStdin, appendLine, setExited } from "@/lib/server-process-store";
import { badRequest, notFound, serverError } from "@/lib/api-helpers";

// Per-project flutter run PID tracking
const flutterPids = new Map<string, number>();

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
  // Common single-level sub-dirs
  for (const sub of ["app", "mobile", "flutter", "client", "frontend"]) {
    const dir = join(cwd, sub);
    if (existsSync(join(dir, "pubspec.yaml"))) return dir;
  }
  // Monorepo: check apps/* and packages/*
  for (const parent of ["apps", "packages"]) {
    const hit = findPubspecInMonorepoParent(join(cwd, parent));
    if (hit) return hit;
  }
  return null;
}

type FlutterCwdOk = { ok: true; cwd: string };
type FlutterCwdErr = { ok: false; response: Response };

function resolveFlutterCwd(projectId: string | undefined, customPath: string | undefined): FlutterCwdOk | FlutterCwdErr {
  if (customPath) {
    const expanded = customPath.replace(/^~(?=\/|$)/, homedir());
    if (!isAbsolute(expanded) || !existsSync(expanded)) return { ok: false, response: badRequest("custom path not found") };
    if (!existsSync(join(expanded, "pubspec.yaml"))) return { ok: false, response: badRequest("no pubspec.yaml in custom path") };
    return { ok: true, cwd: expanded };
  }
  if (!projectId) return { ok: false, response: badRequest("projectId or customPath required") };
  const project = projects.readProject(projectId);
  if (!project) return { ok: false, response: notFound("project not found") };
  const cwd = project.meta.cwd;
  if (!cwd || !isAbsolute(cwd) || !existsSync(cwd)) return { ok: false, response: badRequest("working directory not found") };
  const found = findPubspecDir(cwd);
  if (!found) return { ok: false, response: badRequest(`no pubspec.yaml found in ${cwd} — select a Flutter project in the office or use a custom path`) };
  return { ok: true, cwd: found };
}

function killTrackedRun(trackingKey: string): void {
  const existingPid = flutterPids.get(trackingKey);
  if (!existingPid) return;
  try { process.kill(existingPid, "SIGTERM"); } catch { /* already gone */ }
  flutterPids.delete(trackingKey);
}

function attachChildProcessListeners(child: ReturnType<typeof spawn>, pid: number, trackingKey: string): void {
  child.stdout?.on("data", (data: Buffer) => {
    for (const line of data.toString().split("\n")) {
      if (line.trim()) appendLine(pid, line);
    }
  });
  child.stderr?.on("data", (data: Buffer) => {
    for (const line of data.toString().split("\n")) {
      if (line.trim()) appendLine(pid, `[err] ${line}`);
    }
  });
  child.on("exit", (code, signal) => {
    setExited(pid, code, signal);
    deleteStdin(pid);
    if (flutterPids.get(trackingKey) === pid) flutterPids.delete(trackingKey);
  });
}

export async function POST(req: Request) {
  let body: { projectId?: string; deviceId?: string; customPath?: string } = {};
  try { body = await req.json() as typeof body; } catch { /* no body */ }

  const { projectId, deviceId, customPath } = body;
  const trackingKey = projectId ?? `custom:${customPath ?? ""}`;

  const resolved = resolveFlutterCwd(projectId, customPath);
  if (!resolved.ok) return resolved.response;

  killTrackedRun(trackingKey);

  const args = ["run", "--no-pub"];
  if (deviceId) args.push("-d", deviceId);

  const child = spawn(findFlutterBin(), args, {
    cwd: resolved.cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PATH: `/snap/bin:${process.env.PATH ?? ""}` },
  });

  if (!child.pid) return serverError("failed to start flutter run");

  const pid = child.pid;
  flutterPids.set(trackingKey, pid);
  registerProcess(pid);
  if (child.stdin) registerStdin(pid, child.stdin);
  attachChildProcessListeners(child, pid, trackingKey);

  return NextResponse.json({ pid, flutterCwd: resolved.cwd });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const customPath = searchParams.get("customPath");
  const key = customPath ? `custom:${customPath}` : projectId;
  if (!key) return badRequest("projectId or customPath required");

  const pid = flutterPids.get(key);
  if (!pid) return NextResponse.json({ ok: true, wasRunning: false });

  try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
  flutterPids.delete(key);

  return NextResponse.json({ ok: true, wasRunning: true, pid });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const customPath = searchParams.get("customPath");
  const key = customPath ? `custom:${customPath}` : projectId;
  if (!key) return badRequest("projectId or customPath required");

  const pid = flutterPids.get(key) ?? null;
  let alive = false;
  if (pid) {
    try { process.kill(pid, 0); alive = true; } catch { /* not alive */ }
  }

  return NextResponse.json({ pid, alive });
}
