import assert from "node:assert";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { processes } from "@agent-office/domain/services";
import { spawnInTerminal, isLaunchedShell } from "./terminal";

async function waitFor<T>(probe: () => T | undefined, ms = 10_000): Promise<T | undefined> {
  for (let waited = 0; waited < ms; waited += 100) {
    const v = probe();
    if (v) return v;
    await sleep(100);
  }
  return undefined;
}

type Report = { pid: number; cwd: string; port: string };
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
  const serve = `require('fs').writeFileSync('report.json', JSON.stringify({ pid: process.pid, cwd: process.cwd(), port: process.env.PORT })); setInterval(() => {}, 1000)`;
  if (process.platform === "win32") {
    writeFileSync(join(bin, "devtool.cmd"), `@node -e "${serve}"\r\n`);
  } else {
    writeFileSync(join(bin, "devtool"), `#!/bin/sh\nexec node -e "${serve}"\n`);
    chmodSync(join(bin, "devtool"), 0o755);
  }
  const env = { PATH: process.env.PATH, AO_TERMINAL: process.env.AO_TERMINAL };
  process.env.PATH = `${bin}${delimiter}${env.PATH}`;
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
    assert.deepStrictEqual({ cwd: report.cwd, port: report.port }, { cwd: realpathSync.native(project), port: "4123" });
    await sleep(1500);
    assert.ok(processes.isProcessAlive(pid), "the tracked pid outlives the launch");

    // Never kill by window title on Windows: Windows Terminal hosts every console,
    // Agent Office's own included, in one process the title matches.
    assert.deepStrictEqual(processes.killProcess(pid, { tree: true }), { ok: true });
    const gone = await waitFor(() => !processes.isProcessAlive(pid!) && !processes.isProcessAlive(report.pid));
    assert.ok(gone, "stop kills the shell and the dev process under it");
    pid = null;
  } finally {
    process.env.PATH = env.PATH;
    if (env.AO_TERMINAL === undefined) delete process.env.AO_TERMINAL;
    else process.env.AO_TERMINAL = env.AO_TERMINAL;
    if (pid) processes.killProcess(pid, { tree: true });
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

test("pid 1 and the server's own pid are never killed", () => {
  for (const pid of [1, process.pid]) {
    assert.deepStrictEqual(processes.killProcess(pid, { tree: true }), { ok: false, error: "forbidden", status: 403 });
  }
});
