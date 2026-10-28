// Never through a shell: on Windows `code` is `code.cmd`, which Node spawns only with
// `shell: true` since the CVE-2024-27980 fix, one quote in a path from command injection.
// So Windows gets `Code.exe` itself, which takes a folder as Explorer's "Open with Code" does.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";
import { absoluteSearchPath } from "@agent-office/domain/services/infra/search-path";

export type OpenApp = "folder" | "code";

/** `checkExit` false: Explorer exits 1 even when the window opened; Code.exe stays running. */
export type OpenCommand = { cmd: string; args: string[]; checkExit: boolean };

type Exists = (p: string) => boolean;

/** First absolute PATH entry holding `name`: a relative entry would resolve in the server's cwd. */
function onPath(name: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv, exists: Exists): string | null {
  const path = platform === "win32" ? win32 : posix;
  return absoluteSearchPath(env.PATH ?? env.Path ?? "", platform, env)
    .split(path.delimiter)
    .map((dir) => path.join(dir, name))
    .find(exists) ?? null;
}

/** Where `Code.exe` sits next to the `bin\code.cmd` that PATH lists, else the default installs. */
export function windowsCodeExe(env: NodeJS.ProcessEnv, exists: Exists = existsSync): string | null {
  const cmd = onPath("code.cmd", "win32", env, exists);
  const candidates = [cmd && win32.join(win32.dirname(win32.dirname(cmd)), "Code.exe"),
    env.LOCALAPPDATA && win32.join(env.LOCALAPPDATA, "Programs", "Microsoft VS Code", "Code.exe"),
    env.ProgramFiles && win32.join(env.ProgramFiles, "Microsoft VS Code", "Code.exe")];
  return candidates.find((p): p is string => !!p && exists(p)) ?? null;
}

/** null when no launcher was found: VS Code not installed, or no `xdg-open`. */
export function openCommand(
  app: OpenApp,
  dir: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  exists: Exists = existsSync,
): OpenCommand | null {
  if (platform === "win32") {
    if (app === "folder") return { cmd: win32.join(env.SystemRoot ?? "C:\\Windows", "explorer.exe"), args: [dir], checkExit: false };
    const exe = windowsCodeExe(env, exists);
    return exe ? { cmd: exe, args: [dir], checkExit: false } : null;
  }
  if (platform === "darwin") {
    if (app === "code") return { cmd: "/usr/bin/open", args: ["-a", "Visual Studio Code", dir], checkExit: true };
    // `open` on a bundle (Foo.app, Foo.prefPane) launches it; -R only reveals it in Finder.
    const bundle = exists(posix.join(dir, "Contents", "Info.plist"));
    return { cmd: "/usr/bin/open", args: bundle ? ["-R", dir] : [dir], checkExit: true };
  }
  const cmd = onPath(app === "folder" ? "xdg-open" : "code", platform, env, exists);
  return cmd ? { cmd, args: [dir], checkExit: true } : null;
}

/** Only a plain absolute path reaches a launcher, so it can never parse as an option (`-a`,
 *  `--inspect`) or, for Explorer, as a switch list (`/select,`; commas split its arguments).
 *  Windows takes drive paths only: UNC and device paths, `\\wsl$\` included, are refused on purpose. */
export function isOpenablePath(dir: string, platform: NodeJS.Platform = process.platform): boolean {
  return platform === "win32" ? /^[a-zA-Z]:[\\/][^,"]*$/.test(dir) : posix.isAbsolute(dir);
}

// Some desktops' xdg-open waits on its handler: one still running by now has handed off.
const EXIT_WAIT_MS = 3000;

export type LaunchResult = { ok: true } | { ok: false; detail: string };

/** Every failure is a value: an unhandled 'error' event kills the standalone server. */
export function launchDetached({ cmd, args, checkExit }: OpenCommand): Promise<LaunchResult> {
  return new Promise((resolve) => {
    let settled = false;
    let wait: NodeJS.Timeout | undefined;
    const settle = (r: LaunchResult) => { if (!settled) { settled = true; clearTimeout(wait); resolve(r); } };
    let child;
    try {
      // Inherited from a VS Code extension host, it makes Code.exe run the folder as a script.
      child = spawn(cmd, args, { detached: true, stdio: "ignore", env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    } catch (err) {
      return settle({ ok: false, detail: (err as Error).message });
    }
    child.on("error", (err) => settle({ ok: false, detail: err.message }));
    child.once("exit", (code, signal) => {
      if (checkExit && code !== 0) settle({ ok: false, detail: `${cmd} exited ${code ?? signal}` });
      else settle({ ok: true });
    });
    child.once("spawn", () => {
      if (!checkExit) return settle({ ok: true });
      // Ref'd while waiting: with the child unref'd, nothing else may keep the process up to hear its exit.
      wait = setTimeout(() => settle({ ok: true }), EXIT_WAIT_MS);
    });
    child.unref();
  });
}
