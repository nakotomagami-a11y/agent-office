import { commandOutput, splitHostPort, type Listener, type ProcDetails } from "./probe";

/** `lsof -F` emits one field per line, tagged by its first char: `p` opens a
 *  process, `c` is its command, `n` a file name (here `host:port` or a path). */
function* lsofFields(out: string): Generator<{ pid: number; command: string; name: string }> {
  let pid = 0;
  let command = "";
  for (const line of out.split("\n")) {
    const value = line.slice(1);
    if (line[0] === "p") pid = parseInt(value, 10);
    else if (line[0] === "c") command = value;
    else if (line[0] === "n" && pid > 0) yield { pid, command, name: value };
  }
}

export function parseLsofListeners(out: string): Listener[] {
  const found: Listener[] = [];
  for (const f of lsofFields(out)) {
    const addr = splitHostPort(f.name);
    if (addr) found.push({ pid: f.pid, name: f.command, ...addr });
  }
  return found;
}

export function parseLsofCwds(out: string): Map<number, string> {
  return new Map(Array.from(lsofFields(out), (f) => [f.pid, f.name]));
}

/** `ps -o etime` → seconds. Format: `[[dd-]hh:]mm:ss`. */
export function parseEtime(etime: string): number {
  const [days, clock] = etime.includes("-") ? etime.split("-") : ["0", etime];
  const parts = (clock ?? "").split(":").map(Number).reverse();
  const [s = 0, m = 0, h = 0] = parts;
  const total = Number(days) * 86400 + h * 3600 + m * 60 + s;
  return Number.isFinite(total) ? total : 0;
}

/** `ps -o pid= -o uid= -o rss= -o etime= -o command=` rows; rss is KiB. Other users' rows are dropped. */
export function parsePs(out: string, uid: number | null, cwds: Map<number, string>, now: number): Map<number, ProcDetails> {
  const found = new Map<number, ProcDetails>();
  for (const line of out.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!m || (uid !== null && Number(m[2]) !== uid)) continue;
    const pid = parseInt(m[1]!, 10);
    found.set(pid, {
      name: "",
      cmd: m[5]!.trim(),
      cwd: cwds.get(pid) ?? "",
      startedAt: now - parseEtime(m[4]!) * 1000,
      memMb: Math.round(parseInt(m[3]!, 10) / 1024),
    });
  }
  return found;
}

// `ps -o uid` and `lsof -u` both mean the effective uid.
const currentUid = (): number | null => (typeof process.geteuid === "function" ? process.geteuid() : null);

export async function listeners(): Promise<Listener[] | null> {
  const uid = currentUid();
  const byUid = uid === null ? [] : ["-u", String(uid)];
  const out = await commandOutput("lsof", ["+c", "0", "-nP", "-a", "-iTCP", "-sTCP:LISTEN", ...byUid, "-Fpcn"]);
  return out === null ? null : parseLsofListeners(out);
}

export async function details(pids: number[]): Promise<Map<number, ProcDetails> | null> {
  if (pids.length === 0) return new Map();
  const list = pids.join(",");
  const [ps, cwd] = await Promise.all([
    // BSD ps: an `-o` item holding "=" swallows the rest of its list as a header, so one -o per column.
    commandOutput("ps", ["-ww", "-o", "pid=", "-o", "uid=", "-o", "rss=", "-o", "etime=", "-o", "command=", "-p", list]),
    commandOutput("lsof", ["-a", "-d", "cwd", "-p", list, "-Fn"]),
  ]);
  if (ps === null) return null;
  return parsePs(ps, currentUid(), parseLsofCwds(cwd ?? ""), Date.now());
}
