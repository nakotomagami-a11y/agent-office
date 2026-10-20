import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export type Listener = { pid: number; port: number; address: string; name: string };

export type ProcDetails = { name: string; cmd: string; cwd: string; startedAt: number; memMb: number };

export interface ProcessScanner {
  /** Listening TCP sockets. May include other users' pids; `details` drops those. */
  listeners(): Promise<Listener[]>;
  /** One entry per pid that is still alive and belongs to the current user;
   *  null when the check itself failed, which must not read as "not ours". */
  details(pids: number[]): Promise<Map<number, ProcDetails> | null>;
}

/** stdout of a command, "" if it can't run. `lsof` and BSD `ps` exit 1 when
 *  some pids matched nothing, yet still print the rest. */
export async function commandOutput(cmd: string, args: string[], timeoutMs = 5000): Promise<string> {
  try {
    return (await execFileP(cmd, args, { encoding: "utf8", timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 })).stdout;
  } catch (e) {
    const stdout = (e as { stdout?: unknown }).stdout;
    return typeof stdout === "string" ? stdout : "";
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
