import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export type Listener = { pid: number; port: number; address: string; name: string };

export type ProcDetails = { name: string; cmd: string; cwd: string; startedAt: number; memMb: number };

export type ChildProc = { pid: number; startedAt: number };

export interface ProcessScanner {
  /** Listening TCP sockets, null when the probe couldn't run. May include other users' pids; `details` drops those. */
  listeners(): Promise<Listener[] | null>;
  /** One entry per pid that is still alive and belongs to the current user;
   *  null when the check itself failed, which must not read as "not ours". */
  details(pids: number[]): Promise<Map<number, ProcDetails> | null>;
  /** Direct children of `pid`; null when the check itself failed, which must not read as "none". */
  children(pid: number): Promise<ChildProc[] | null>;
}

/** stdout of a command; null when it couldn't run or was killed by the timeout. A
 *  non-zero exit keeps its stdout: `lsof` and BSD `ps` exit 1 when some pids matched
 *  nothing, yet still print the rest. */
export async function commandOutput(cmd: string, args: string[], timeoutMs = 5000): Promise<string | null> {
  try {
    return (await execFileP(cmd, args, { encoding: "utf8", timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 })).stdout;
  } catch (e) {
    const { stdout, code, killed } = e as { stdout?: unknown; code?: unknown; killed?: boolean };
    return typeof code === "number" && !killed && typeof stdout === "string" ? stdout : null;
  }
}

/** "127.0.0.1:3000", "[::1]:3000", "*:3000" → bare address + port; "*" is the IPv4 wildcard. */
export function splitHostPort(raw: string): { address: string; port: number } | null {
  const i = raw.lastIndexOf(":");
  const port = Number(raw.slice(i + 1));
  if (i <= 0 || !Number.isInteger(port) || port <= 0) return null;
  const host = raw.slice(0, i).replace(/^\[(.*)\]$/, "$1");
  return { address: host === "*" ? "0.0.0.0" : host, port };
}

/** `ps -o etime` → seconds. Format: `[[dd-]hh:]mm:ss`. */
export function parseEtime(etime: string): number {
  const [days, clock] = etime.includes("-") ? etime.split("-") : ["0", etime];
  const parts = (clock ?? "").split(":").map(Number).reverse();
  const [s = 0, m = 0, h = 0] = parts;
  const total = Number(days) * 86400 + h * 3600 + m * 60 + s;
  return Number.isFinite(total) ? total : 0;
}

/** `ps -A -o pid= -o ppid= -o etime=` rows whose parent is `ppid`. etime has 1 s resolution. */
export function parsePsChildren(out: string, ppid: number, now: number): ChildProc[] {
  const found: ChildProc[] = [];
  for (const line of out.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s*$/.exec(line);
    if (m && Number(m[2]) === ppid) found.push({ pid: Number(m[1]), startedAt: now - parseEtime(m[3]!) * 1000 });
  }
  return found;
}

/** BSD and procps `ps` agree on these flags; `--ppid` is procps-only. */
export async function posixChildren(pid: number): Promise<ChildProc[] | null> {
  const out = await commandOutput("ps", ["-A", "-o", "pid=", "-o", "ppid=", "-o", "etime="]);
  return out === null ? null : parsePsChildren(out, pid, Date.now());
}
