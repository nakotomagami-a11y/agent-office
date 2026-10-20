import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export type Listener = { pid: number; port: number; address: string; name: string };

export type ProcDetails = { name: string; cmd: string; cwd: string; startedAt: number; memMb: number };

export interface ProcessScanner {
  /** Listening TCP sockets, null when the probe couldn't run. May include other users' pids; `details` drops those. */
  listeners(): Promise<Listener[] | null>;
  /** One entry per pid that is still alive and belongs to the current user;
   *  null when the check itself failed, which must not read as "not ours". */
  details(pids: number[]): Promise<Map<number, ProcDetails> | null>;
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
