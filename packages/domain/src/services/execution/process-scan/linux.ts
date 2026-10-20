import { readFileSync, readlinkSync } from "node:fs";
import * as os from "node:os";
import { commandOutput, splitHostPort, type Listener, type ProcDetails } from "./probe";

export { posixChildren as children } from "./probe";

const CLOCK_TICKS = 100;

function readStatus(pid: number): string {
  try {
    return readFileSync(`/proc/${pid}/status`, "utf8");
  } catch {
    return "";
  }
}

function uidOf(status: string): number | null {
  const match = /^Uid:\s+(\d+)/m.exec(status);
  return match ? parseInt(match[1]!, 10) : null;
}

export function readProcUid(pid: number): number | null {
  return uidOf(readStatus(pid));
}

function readProcMem(status: string): number {
  const match = /^VmRSS:\s+(\d+)\s+kB/m.exec(status);
  return match ? Math.round(parseInt(match[1]!, 10) / 1024) : 0;
}

function readProcCmdline(pid: number): string {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0+$/, "").replace(/\0/g, " ");
  } catch {
    return "";
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
    const fields = readFileSync(`/proc/${pid}/stat`, "utf8").split(" ");
    // field 22 (1-indexed) = starttime, in clock ticks since boot
    const starttime = parseInt(fields[21] ?? "0", 10);
    if (!Number.isFinite(starttime) || starttime === 0) return 0;
    return Math.floor(Date.now() - os.uptime() * 1000 + (starttime / CLOCK_TICKS) * 1000);
  } catch {
    return 0;
  }
}

/** `ss -tlnp` lines: `LISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=42,fd=21))`. */
export function parseSs(out: string): Listener[] {
  const found: Listener[] = [];
  for (const line of out.split("\n")) {
    if (!line.includes("users:((")) continue;
    const local = /\s(\S+:\d+)\s+\S+:\*/.exec(line);
    const addr = local ? splitHostPort(local[1]!) : null;
    if (!addr) continue;
    for (const m of line.matchAll(/\("([^"]+)",pid=(\d+)/g)) {
      const pid = parseInt(m[2]!, 10);
      if (pid > 0) found.push({ pid, name: m[1]!, ...addr });
    }
  }
  return found;
}

export async function listeners(): Promise<Listener[] | null> {
  const out = await commandOutput("ss", ["-tlnp"]);
  return out === null ? null : parseSs(out);
}

export async function details(pids: number[]): Promise<Map<number, ProcDetails>> {
  const currentUid = typeof process.getuid === "function" ? process.getuid() : null;
  const out = new Map<number, ProcDetails>();
  for (const pid of pids) {
    const status = readStatus(pid);
    const uid = uidOf(status);
    if (uid === null || (currentUid !== null && uid !== currentUid)) continue;
    out.set(pid, {
      name: "",
      cmd: readProcCmdline(pid),
      cwd: readProcCwd(pid),
      startedAt: readProcStartedAt(pid),
      memMb: readProcMem(status),
    });
  }
  return out;
}
