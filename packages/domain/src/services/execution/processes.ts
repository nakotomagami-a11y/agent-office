// Dev/build server process discovery: list listening sockets, resolve each
// owning PID, and match it to a project by cwd. The per-OS probing (Linux,
// macOS, Windows) lives in ./process-scan. Backs GET /api/processes.
import { execFileSync } from "node:child_process";
import { normalize, sep } from "node:path";
import type { ProcessInfo } from "../../types/index";
import type { BackgroundShellRow } from "../db/background-shells";
import * as projects from "../projects/projects";
import * as db from "../db";
import { log } from "../infra/log";
import { readProcUid, scanner, type ProcDetails } from "./process-scan";

type SortedProject = { id: string; name: string; cwd: string };
type ProjectMatch = { projectId: string; projectName: string } | undefined;

const caseInsensitivePaths = process.platform === "win32" || process.platform === "darwin";
const CMD_MAX = 120;

function pathKey(p: string): string {
  const n = normalize(p);
  return caseInsensitivePaths ? n.toLowerCase() : n;
}

function buildSortedProjectList(): SortedProject[] {
  return projects
    .listProjectSummaries()
    .filter((p) => !!p.cwd)
    .map((p) => ({ id: p.id, name: p.name, cwd: pathKey(p.cwd!) }))
    .sort((a, b) => b.cwd.length - a.cwd.length);
}

function matchProjectByCwd(projectList: SortedProject[], cwd: string): ProjectMatch {
  if (!cwd) return undefined;
  const key = pathKey(cwd);
  const match = projectList.find((p) => key === p.cwd || key.startsWith(p.cwd + sep));
  return match ? { projectId: match.id, projectName: match.name } : undefined;
}

function matchProjectById(projectList: SortedProject[], projectId: string): ProjectMatch {
  const match = projectList.find((p) => p.id === projectId);
  return match ? { projectId: match.id, projectName: match.name } : undefined;
}

/** Parse a strictly-positive integer pid (no leading zeros / trailing junk). */
export function parsePid(raw: string): number | null {
  const pid = parseInt(raw, 10);
  return Number.isInteger(pid) && pid > 0 && String(pid) === raw ? pid : null;
}

export function isProcessAlive(pid: number): boolean {
  return db.isPidAlive(pid);
}

export type KillResult = { ok: true } | { ok: false; error: string; status: number };

/** SIGKILL (dev servers were seen ignoring SIGTERM) a pid. `tree` takes its children too:
 *  only for a pid the caller launched, a reused one isn't ours. Ownership is checked on
 *  Linux only: an elevated server on Windows/macOS kills anything, so routes go
 *  through `killOwnedProcess`. */
export function killProcessUnchecked(pid: number, { tree = false }: { tree?: boolean } = {}): KillResult {
  // kill(-1) signals every process the user owns.
  if (pid <= 1 || pid === process.pid) return { ok: false, error: "forbidden", status: 403 };
  const currentUid = process.platform === "linux" && typeof process.getuid === "function" ? process.getuid() : null;
  if (currentUid !== null) {
    const uid = readProcUid(pid);
    if (uid === null) return { ok: false, error: "not_found", status: 404 };
    if (uid !== currentUid) return { ok: false, error: "forbidden", status: 403 };
  }
  try {
    if (tree) killTree(pid);
    else process.kill(pid, "SIGKILL");
    // User-initiated kill (Servers modal) — drop any background_shells row
    // for this pid now, so the watcher never mistakes this for an
    // unattended task finishing and nudges the agent about something the
    // user just did on purpose.
    const row = db.listBackgroundShells().find((r) => r.pid === pid);
    if (row) db.deleteBackgroundShell(row.id);
    return { ok: true };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ESRCH") return { ok: false, error: "not_found", status: 404 };
    if (err.code === "EPERM") return { ok: false, error: "forbidden", status: 403 };
    return { ok: false, error: "internal_error", status: 500 };
  }
}

/** Off Linux the pid must first pass the list's ownership rule. `tree` marks a shell this
 *  server launched and is still running, which is ours without asking. */
export async function killOwnedProcess(pid: number, opts: { tree?: boolean } = {}): Promise<KillResult> {
  if (process.platform !== "linux" && scanner && !opts.tree && pid > 1 && pid !== process.pid) {
    const info = await scanner.details([pid]).catch(() => null);
    if (!info) return { ok: false, error: "ownership_unverified", status: 503 };
    if (!info.has(pid)) return isProcessAlive(pid) ? { ok: false, error: "forbidden", status: 403 } : { ok: false, error: "not_found", status: 404 };
  }
  const result = killProcessUnchecked(pid, opts);
  if (result.ok) lastScan = null;
  return result;
}

function killTree(pid: number): void {
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } catch (e) {
      if (!isProcessAlive(pid)) throw Object.assign(new Error("process not found"), { code: "ESRCH" });
      throw e;
    }
    return;
  }
  // A terminal shell leads its group; children that regrouped (turborepo tasks) survive.
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    process.kill(pid, "SIGKILL");
  }
}

/** Agent-started `run_in_background` shells still alive; dead rows are pruned. */
function liveBackgroundShells(): BackgroundShellRow[] {
  try {
    return db.listBackgroundShells().filter((row) => {
      if (db.isPidAlive(row.pid)) return true;
      db.deleteBackgroundShell(row.id);
      return false;
    });
  } catch {
    return [];
  }
}

/** Merge in background shells the port scan can't see because they never
 *  listen on a port. One already covered by the scan is just enriched with
 *  the agent attribution. */
function mergeBackgroundShells(
  byPid: Map<number, ProcessInfo>,
  shells: BackgroundShellRow[],
  info: Map<number, ProcDetails>,
  projectList: SortedProject[],
): void {
  for (const row of shells) {
    const attribution = {
      runId: row.runId,
      agentId: row.agentId,
      agentName: row.agentName,
      instanceLabel: row.instanceLabel ?? undefined,
    };
    const existing = byPid.get(row.pid);
    if (existing) {
      Object.assign(existing, attribution);
      continue;
    }
    const cwd = info.get(row.pid)?.cwd ?? "";
    byPid.set(row.pid, {
      pid: row.pid,
      port: 0,
      address: "",
      name: row.description || row.command.split(/\s+/)[0] || row.agentName,
      cmd: row.command,
      cwd,
      startedAt: row.startedAt,
      memMb: info.get(row.pid)?.memMb ?? 0,
      source: "background-task",
      ...attribution,
      ...(row.projectId ? matchProjectById(projectList, row.projectId) : matchProjectByCwd(projectList, cwd)),
    });
  }
}

// Clients poll every 5s and a Windows scan spawns PowerShell: share one, TTL from settling (null = in flight).
const SCAN_TTL_MS = 3000;
const WARN_EVERY_MS = 60_000;
let lastScan: { settledAt: number | null; result: Promise<ProcessInfo[]> } | null = null;
let lastWarnAt = 0;

/** List the current user's listening processes matched to projects, plus any
 *  agent-started background shell that's still alive. [] on an OS with no scanner. */
export function listProcesses(): Promise<ProcessInfo[]> {
  if (lastScan && (lastScan.settledAt === null || Date.now() - lastScan.settledAt < SCAN_TTL_MS)) return lastScan.result;
  const entry: NonNullable<typeof lastScan> = { settledAt: null, result: scanProcesses() };
  const settle = () => { entry.settledAt = Date.now(); };
  entry.result.then(settle, settle);
  lastScan = entry;
  return entry.result;
}

async function scanDetails(pids: number[]): Promise<Map<number, ProcDetails>> {
  const info = await scanner!.details(pids).catch(() => null);
  if (info) return info;
  // Without this, a blocked or timed-out probe just looks like "no servers running".
  if (Date.now() - lastWarnAt > WARN_EVERY_MS) {
    lastWarnAt = Date.now();
    log.warn("processes.details_failed", { platform: process.platform, pids: pids.length });
  }
  return new Map();
}

async function scanProcesses(): Promise<ProcessInfo[]> {
  if (!scanner) return [];
  const projectList = buildSortedProjectList();
  const listening = await scanner.listeners().catch(() => []);
  const shells = liveBackgroundShells();
  const pids = [...new Set([...listening.map((l) => l.pid), ...shells.map((r) => r.pid)])];
  const info = await scanDetails(pids);

  const byPid = new Map<number, ProcessInfo>();
  for (const l of listening) {
    const d = info.get(l.pid);
    if (!d || byPid.has(l.pid)) continue;
    byPid.set(l.pid, {
      pid: l.pid,
      port: l.port,
      address: l.address,
      name: l.name || d.name,
      cmd: d.cmd.slice(0, CMD_MAX),
      cwd: d.cwd,
      startedAt: d.startedAt,
      memMb: d.memMb,
      ...matchProjectByCwd(projectList, d.cwd),
    });
  }
  mergeBackgroundShells(byPid, shells, info, projectList);
  return Array.from(byPid.values());
}
