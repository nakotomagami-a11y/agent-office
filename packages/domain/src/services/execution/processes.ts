// Dev/build server process discovery: parse `ss -tlnp` for listening sockets,
// resolve each owning PID via /proc, and match it to a project by cwd. Linux-only
// (returns [] elsewhere). Backs GET /api/processes.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readlinkSync } from "node:fs";
import * as os from "node:os";
import { normalize } from "node:path";
import type { ProcessInfo } from "../../types/index";
import * as projects from "../projects/projects";

const CLOCK_TICKS = 100;

// ─── /proc readers ───────────────────────────────────────────────────────────

function readProcMem(pid: number): number {
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const match = /^VmRSS:\s+(\d+)\s+kB/m.exec(status);
    if (!match) return 0;
    return Math.round(parseInt(match[1]!, 10) / 1024);
  } catch {
    return 0;
  }
}

function readProcCmdline(pid: number): string {
  try {
    const raw = readFileSync(`/proc/${pid}/cmdline`, "utf8");
    return raw.replace(/\0+$/, "").replace(/\0/g, " ").slice(0, 120);
  } catch {
    return "";
  }
}

function readProcUid(pid: number): number | null {
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const match = /^Uid:\s+(\d+)/m.exec(status);
    if (!match) return null;
    return parseInt(match[1]!, 10);
  } catch {
    return null;
  }
}

function readProcCwd(pid: number): string {
  try {
    return readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    return "";
  }
}

function readProcStartedAt(pid: number): number {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.split(" ");
    // field 22 (1-indexed) = starttime; array index 21
    const starttime = parseInt(fields[21] ?? "0", 10);
    if (!Number.isFinite(starttime) || starttime === 0) return 0;
    const uptimeMs = os.uptime() * 1000;
    const startMs = Date.now() - uptimeMs + (starttime / CLOCK_TICKS) * 1000;
    return Math.floor(startMs);
  } catch {
    return 0;
  }
}

// ─── Project matching ────────────────────────────────────────────────────────

type SortedProject = { id: string; name: string; cwd: string };

function buildSortedProjectList(): SortedProject[] {
  return projects
    .listProjectSummaries()
    .filter((p) => !!p.cwd)
    .map((p) => ({ id: p.id, name: p.name, cwd: normalize(p.cwd!) }))
    .sort((a, b) => b.cwd.length - a.cwd.length);
}

function matchProjectByCwd(
  projectList: SortedProject[],
  cwd: string,
): { projectId: string; projectName: string } | undefined {
  if (!cwd) return undefined;
  const norm = normalize(cwd);
  const match = projectList.find((p) => norm === p.cwd || norm.startsWith(p.cwd + "/"));
  return match ? { projectId: match.id, projectName: match.name } : undefined;
}

// ─── `ss` parsing ────────────────────────────────────────────────────────────

function parseSsAddressAndPort(line: string): { address: string; port: number } | null {
  const addrMatch = /\s(\S+):(\d+)\s+\S+:\*/.exec(line);
  if (!addrMatch) return null;
  const address = addrMatch[1]!;
  const port = parseInt(addrMatch[2]!, 10);
  if (!Number.isFinite(port) || port <= 0) return null;
  return { address, port };
}

function isSkippableForUid(pid: number, currentUid: number | null): boolean {
  if (currentUid === null) return false;
  const uid = readProcUid(pid);
  return uid !== null && uid !== currentUid;
}

function makeProcessInfo(pid: number, name: string, port: number, address: string, projectList: SortedProject[]): ProcessInfo {
  const cwd = readProcCwd(pid);
  return {
    pid,
    port,
    address,
    name,
    cmd: readProcCmdline(pid),
    cwd,
    startedAt: readProcStartedAt(pid),
    memMb: readProcMem(pid),
    ...matchProjectByCwd(projectList, cwd),
  };
}

function collectPidsFromLine(
  line: string,
  address: string,
  port: number,
  currentUid: number | null,
  projectList: SortedProject[],
  byPid: Map<number, ProcessInfo>,
): void {
  const pidRe = /\("([^"]+)",pid=(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = pidRe.exec(line)) !== null) {
    const name = m[1]!;
    const pid = parseInt(m[2]!, 10);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    if (isSkippableForUid(pid, currentUid)) continue;
    if (byPid.has(pid)) continue;
    byPid.set(pid, makeProcessInfo(pid, name, port, address, projectList));
  }
}

// ─── Single-process inspection + control ─────────────────────────────────────

/** Parse a strictly-positive integer pid (no leading zeros / trailing junk). */
export function parsePid(raw: string): number | null {
  const pid = parseInt(raw, 10);
  return Number.isInteger(pid) && pid > 0 && String(pid) === raw ? pid : null;
}

export function isProcessAlive(pid: number): boolean {
  return existsSync(`/proc/${pid}/status`);
}

export type KillResult = { ok: true } | { ok: false; error: string; status: number };

/** SIGKILL a process, refusing to kill one owned by another uid. SIGKILL (not
 *  SIGTERM) because tracked dev servers were observed ignoring SIGTERM. */
export function killProcess(pid: number): KillResult {
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  if (currentUid !== null) {
    const uid = readProcUid(pid);
    if (uid === null) return { ok: false, error: "not_found", status: 404 };
    if (uid !== currentUid) return { ok: false, error: "forbidden", status: 403 };
  }
  try {
    process.kill(pid, "SIGKILL");
    return { ok: true };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ESRCH") return { ok: false, error: "not_found", status: 404 };
    return { ok: false, error: "internal_error", status: 500 };
  }
}

/** List listening dev/build processes matched to projects. Linux-only ([] elsewhere). */
export function listProcesses(): ProcessInfo[] {
  if (process.platform !== "linux") return [];

  let ssOutput: string;
  try {
    ssOutput = execFileSync("ss", ["-tlnp"], { encoding: "utf8", timeout: 5000 });
  } catch {
    return [];
  }

  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  const projectList = buildSortedProjectList();
  const byPid = new Map<number, ProcessInfo>();

  for (const line of ssOutput.split("\n")) {
    if (!line.includes("users:((")) continue;
    const parsed = parseSsAddressAndPort(line);
    if (!parsed) continue;
    collectPidsFromLine(line, parsed.address, parsed.port, currentUid, projectList, byPid);
  }

  return Array.from(byPid.values());
}
