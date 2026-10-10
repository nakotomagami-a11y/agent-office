// A PATH entry that is not absolute is searched relative to the CHILD's cwd, and
// children run in project folders, i.e. in repo content. A repo shipping
// `%USERPROFILE%\AppData\Local\Microsoft\WindowsApps\gh.exe` ran as `gh` on a
// machine whose PATH held that entry unexpanded. So every spawn PATH keeps
// absolute entries only, after expanding Windows `%VAR%` references.
import { posix, win32 } from "node:path";

function expandWindowsVars(entry: string, env: NodeJS.ProcessEnv): string {
  return entry.replace(/%([^%;]+)%/g, (whole, name: string) => {
    const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
    return key && env[key] ? env[key]! : whole;
  });
}

/** Drive-absolute (`C:\…`) or UNC (`\\host\…`, `//host/…`) only: `\foo` and `C:foo` depend on the current drive or dir. */
const isWindowsAbsolute = (p: string) => /^[a-zA-Z]:[\\/]/.test(p) || /^[\\/]{2}[^\\/]/.test(p);

export function absoluteSearchPath(raw: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv = process.env): string {
  if (platform === "win32") {
    return raw
      .split(win32.delimiter)
      // Expand, then split again: a variable's value may itself hold several entries.
      .flatMap((e) => expandWindowsVars(e.trim().replace(/^"(.*)"$/, "$1"), env).split(win32.delimiter))
      .map((e) => e.trim().replace(/^"(.*)"$/, "$1"))
      .filter(isWindowsAbsolute)
      .join(win32.delimiter);
  }
  // Bash expands a leading ~ in PATH entries; keep that working rather than dropping them.
  const home = env.HOME;
  return raw
    .split(posix.delimiter)
    .map((e) => (home && (e === "~" || e.startsWith("~/")) ? home + e.slice(1) : e))
    .filter((e) => posix.isAbsolute(e))
    .join(posix.delimiter);
}
