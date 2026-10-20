import assert from "node:assert";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { processes } from "@agent-office/domain/services";
import { spawnInTerminal, isLaunchedShell, hasShellCommandExited } from "./terminal";
import { GET as getProcess } from "../routes/processes/[pid]/route";

async function waitFor<T>(probe: () => T | undefined, ms = 10_000): Promise<T | undefined> {
  for (let waited = 0; waited < ms; waited += 100) {
    const v = probe();
    if (v) return v;
    await sleep(100);
  }
  return undefined;
}

type Report = { pid: number; cwd: string; port: string; aoBaseUrl: string | null };
const isReport = (v: unknown): v is Report =>
  !!v && typeof v === "object" && "pid" in v && typeof v.pid === "number" && "cwd" in v && "port" in v;

// Two regressions: on Windows a bare spawn of pnpm.cmd threw an uncaught ENOENT
// that killed the server, and every platform returned a pid that exited at once
// (the `start` helper, a single-instance terminal's client), so the row flipped to
// idle within seconds and Stop could not reach the dev server.
test("a dev command runs in the project dir with PORT set, stays tracked, and stop kills its tree", async () => {
  const bin = mkdtempSync(join(tmpdir(), "ao-term-bin-"));
  // `[` is a PowerShell wildcard and `’` a PowerShell quote; both once broke the Windows launch.
  const project = mkdtempSync(join(tmpdir(), "ao-term [x] ’-"));
  const reportFile = join(project, "report.json");
  // Node writes the report, not the shell: cmd's echo would mangle `’` through the OEM codepage.
  const serve = `require('fs').writeFileSync('report.json', JSON.stringify({ pid: process.pid, cwd: process.cwd(), port: process.env.PORT, aoBaseUrl: process.env.AO_BASE_URL ?? null })); setInterval(() => {}, 1000)`;
  if (process.platform === "win32") {
    writeFileSync(join(bin, "devtool.cmd"), `@node -e "${serve}"\r\n`);
  } else {
    writeFileSync(join(bin, "devtool"), `#!/bin/sh\nexec node -e "${serve}"\n`);
    chmodSync(join(bin, "devtool"), 0o755);
  }
  const env = { PATH: process.env.PATH, AO_TERMINAL: process.env.AO_TERMINAL, AO_BASE_URL: process.env.AO_BASE_URL };
  process.env.PATH = `${bin}${delimiter}${env.PATH}`;
  // A child Agent Office that inherited this would advertise the parent's URL.
  process.env.AO_BASE_URL = "http://127.0.0.1:1";
  // POSIX goes headless so CI needs no display; Windows keeps checking the real console launch.
  if (process.platform !== "win32") process.env.AO_TERMINAL = "none";
  let pid: number | null = null;
  try {
    pid = await spawnInTerminal(`ao-terminal-test-${process.pid}`, project, ["devtool"], 4123);
    assert.ok(pid && pid > 0, "spawnInTerminal resolves to the shell's pid");
    assert.ok(isLaunchedShell(pid));

    const report = await waitFor(() => {
      try {
        const r: unknown = JSON.parse(readFileSync(reportFile, "utf8"));
        return isReport(r) ? r : undefined;
      } catch { return undefined; }
    });
    assert.ok(report, "the dev process started");
    // process.cwd() is physical: macOS tmpdir is a symlink into /private.
    assert.deepStrictEqual(
      { cwd: report.cwd, port: report.port, aoBaseUrl: report.aoBaseUrl },
      { cwd: realpathSync.native(project), port: "4123", aoBaseUrl: null },
    );
    await sleep(1500);
    assert.ok(processes.isProcessAlive(pid), "the tracked pid outlives the launch");
    assert.ok(!hasShellCommandExited(pid), "a running command is not reported as exited");

    // Never kill by window title on Windows: Windows Terminal hosts every console,
    // Agent Office's own included, in one process the title matches.
    assert.deepStrictEqual(processes.killProcessUnchecked(pid, { tree: true }), { ok: true });
    const gone = await waitFor(() => !processes.isProcessAlive(pid!) && !processes.isProcessAlive(report.pid));
    assert.ok(gone, "stop kills the shell and the dev process under it");
    pid = null;
  } finally {
    process.env.PATH = env.PATH;
    if (env.AO_TERMINAL === undefined) delete process.env.AO_TERMINAL;
    else process.env.AO_TERMINAL = env.AO_TERMINAL;
    if (env.AO_BASE_URL === undefined) delete process.env.AO_BASE_URL;
    else process.env.AO_BASE_URL = env.AO_BASE_URL;
    if (pid) processes.killProcessUnchecked(pid, { tree: true });
    for (const dir of [bin, project]) {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 20 });
      } catch (err) {
        // The closing console can still hold its cwd; a leftover temp dir must not mask the result.
        console.warn(`left ${dir}: ${(err as NodeJS.ErrnoException).code}`);
      }
    }
  }
});

// The window stays open after the command ends (cmd /k, "Press Enter"), so the shell's
// pid stayed alive and a crashed dev server showed as running until the window closed.
test("a command that ends is reported as exited while its window stays open", async () => {
  const project = mkdtempSync(join(tmpdir(), "ao-term-exit-"));
  const aoTerminal = process.env.AO_TERMINAL;
  if (process.platform !== "win32") process.env.AO_TERMINAL = "none";
  let pid: number | null = null;
  try {
    // On Windows the command runs in a nested cmd, which must hand its argv over intact.
    const arg = 'a b&c "d"';
    const script = "require('fs').writeFileSync('arg.txt', process.argv[1]); process.exit(3)";
    pid = await spawnInTerminal(`ao-terminal-exit-test-${process.pid}`, project, ["node", "-e", script, arg]);
    assert.ok(pid && pid > 0);
    const shellPid = pid;
    assert.ok(await waitFor(() => hasShellCommandExited(shellPid)), "the exit marker appears once the command returns");
    assert.strictEqual(readFileSync(join(project, "arg.txt"), "utf8"), arg);
    // Every poll must agree, not just the first: a lost response or a second tab saw "running" again.
    for (let i = 0; i < 2; i++) {
      const res = await getProcess(new Request("http://x"), { params: Promise.resolve({ pid: String(shellPid) }) });
      assert.deepStrictEqual(await res.json(), { alive: false }, `poll ${i + 1}`);
    }
    if (process.platform === "win32") {
      assert.ok(processes.isProcessAlive(shellPid), "the window stays open");
      assert.ok(isLaunchedShell(shellPid), "an open window is still ours to stop, tree and all");
    }
  } finally {
    if (aoTerminal === undefined) delete process.env.AO_TERMINAL;
    else process.env.AO_TERMINAL = aoTerminal;
    if (pid) processes.killProcessUnchecked(pid, { tree: true });
    try {
      rmSync(project, { recursive: true, force: true, maxRetries: 20 });
    } catch (err) {
      console.warn(`left ${project}: ${(err as NodeJS.ErrnoException).code}`);
    }
  }
});

test("pid 1 and the server's own pid are never killed", () => {
  for (const pid of [1, process.pid]) {
    assert.deepStrictEqual(processes.killProcessUnchecked(pid, { tree: true }), { ok: false, error: "forbidden", status: 403 });
  }
});
