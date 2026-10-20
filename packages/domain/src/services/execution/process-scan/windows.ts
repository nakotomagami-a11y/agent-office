import { join } from "node:path";
import { commandOutput, splitHostPort, type ChildProc, type Listener, type ProcDetails } from "./probe";

// Windows exposes no other process's cwd through WMI, only through its PEB:
// PEB+0x20 → RTL_USER_PROCESS_PARAMETERS, +0x38 → CurrentDirectory (x64/ARM64
// layout). OpenProcess fails for SYSTEM and elevated pids, which leaves cwd "".
// A 32-bit (WOW64) target reports its 64-bit PEB copy: possibly its starting cwd.
const CWD_READER = `
using System;
using System.Runtime.InteropServices;
public static class AoCwd {
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(int access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr h, IntPtr addr, byte[] buf, IntPtr size, out IntPtr read);
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h, int cls, IntPtr[] info, int len, out int retLen);
  static byte[] Read(IntPtr h, IntPtr addr, int n) {
    var b = new byte[n]; IntPtr r;
    return ReadProcessMemory(h, addr, b, (IntPtr)n, out r) && (int)r == n ? b : null;
  }
  public static string Get(int pid) {
    if (IntPtr.Size != 8) return "";
    IntPtr h = OpenProcess(0x1010, false, pid);
    if (h == IntPtr.Zero) return "";
    try {
      var pbi = new IntPtr[6]; int len;
      if (NtQueryInformationProcess(h, 0, pbi, 48, out len) != 0) return "";
      var peb = Read(h, pbi[1] + 0x20, 8); if (peb == null) return "";
      var us = Read(h, (IntPtr)BitConverter.ToInt64(peb, 0) + 0x38, 16); if (us == null) return "";
      int n = BitConverter.ToUInt16(us, 0); if (n == 0) return "";
      var s = Read(h, (IntPtr)BitConverter.ToInt64(us, 8), n); if (s == null) return "";
      var dir = System.Text.Encoding.Unicode.GetString(s);
      return dir.Length > 3 ? dir.TrimEnd((char)92) : dir;
    } finally { CloseHandle(h); }
  }
}`;

function detailsScript(pids: number[]): string {
  return `$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try { Add-Type -TypeDefinition @'
${CWD_READER}
'@ } catch {}
$cwdOk = [bool]('AoCwd' -as [type])
$self = (Get-Process -Id $PID).SessionId
$filter = '(' + ((@(${pids.join(",")}) | ForEach-Object { "ProcessId=$_" }) -join ' OR ') + ") AND SessionId=$self"
$procs = @(Get-CimInstance Win32_Process -Filter $filter | ForEach-Object {
  [pscustomobject]@{
    pid = [int]$_.ProcessId; session = [int]$_.SessionId; name = [string]$_.Name; cmd = [string]$_.CommandLine
    cwd = $(if ($cwdOk) { [AoCwd]::Get([int]$_.ProcessId) } else { '' })
    startedAt = $(if ($_.CreationDate) { ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { 0 })
    memMb = [math]::Round($_.WorkingSetSize / 1MB)
  }
})
ConvertTo-Json -Compress -Depth 3 @{ session = $self; procs = $procs }`;
}

/** `netstat -ano` TCP rows whose foreign address is the any-address, i.e.
 *  LISTENING — matched structurally because the state column is localized. */
export function parseNetstat(out: string): Listener[] {
  const found: Listener[] = [];
  for (const line of out.split(/\r?\n/)) {
    const m = /^\s*TCP\s+(\S+)\s+(?:0\.0\.0\.0|\[::\]):0\s+.*?(\d+)\s*$/.exec(line);
    const addr = m ? splitHostPort(m[1]!) : null;
    const pid = m ? parseInt(m[2]!, 10) : 0;
    if (addr && pid > 0) found.push({ pid, name: "", ...addr });
  }
  return found;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** The details script's JSON; null when PowerShell didn't produce it (timeout,
 *  blocked). Ownership rule: same interactive logon session as the server, so
 *  services are out but a `runas` or elevated process in this session is in. */
export function parseDetails(raw: string): Map<number, ProcDetails> | null {
  const out = new Map<number, ProcDetails>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const doc = asRecord(parsed);
  const ours = num(doc?.session);
  if (ours <= 0) return null;
  const procs = Array.isArray(doc?.procs) ? doc.procs : [];
  for (const entry of procs) {
    const p = asRecord(entry);
    const pid = num(p?.pid);
    if (!p || pid <= 0 || num(p.session) !== ours) continue;
    out.set(pid, {
      name: str(p.name).replace(/\.exe$/i, ""),
      cmd: str(p.cmd),
      cwd: str(p.cwd),
      startedAt: num(p.startedAt),
      memMb: num(p.memMb),
    });
  }
  return out;
}

const system32 = (...parts: string[]): string => join(process.env.SystemRoot ?? "C:\\Windows", "System32", ...parts);

export async function listeners(): Promise<Listener[] | null> {
  const out = await commandOutput(system32("NETSTAT.EXE"), ["-ano"]);
  return out === null ? null : parseNetstat(out);
}

// A cold PowerShell start under an antivirus scan can take seconds (see terminal.ts).
const POWERSHELL_TIMEOUT_MS = 20_000;

export async function details(pids: number[]): Promise<Map<number, ProcDetails> | null> {
  // The pids are spliced into executable script text.
  const safe = pids.filter((pid) => Number.isSafeInteger(pid) && pid > 0);
  if (safe.length === 0) return new Map();
  const powershell = system32("WindowsPowerShell", "v1.0", "powershell.exe");
  const encoded = Buffer.from(detailsScript(safe), "utf16le").toString("base64");
  return parseDetails((await commandOutput(powershell, ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], POWERSHELL_TIMEOUT_MS)) ?? "");
}

/** The children script's JSON, `{procs: [{pid, startedAt}]}`; null when PowerShell didn't produce it. */
export function parseChildren(raw: string): ChildProc[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const procs = asRecord(parsed)?.procs;
  if (!Array.isArray(procs)) return null;
  return procs.map(asRecord)
    .filter((r): r is Record<string, unknown> => r !== null && num(r.pid) > 0)
    .map((r) => ({ pid: num(r.pid), startedAt: num(r.startedAt) }));
}

export async function children(pid: number): Promise<ChildProc[] | null> {
  if (!Number.isSafeInteger(pid) || pid <= 0) return [];
  // 'Stop': a failed query prints nothing, so it can't read as "no children".
  const script = `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$procs = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | ForEach-Object {
  [pscustomobject]@{ pid = [int]$_.ProcessId; startedAt = ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() }
})
ConvertTo-Json -Compress -Depth 3 @{ procs = $procs }`;
  const powershell = system32("WindowsPowerShell", "v1.0", "powershell.exe");
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return parseChildren((await commandOutput(powershell, ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], POWERSHELL_TIMEOUT_MS)) ?? "");
}
