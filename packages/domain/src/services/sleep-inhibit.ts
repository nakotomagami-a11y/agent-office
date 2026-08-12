import { spawn, type ChildProcess } from "node:child_process";
import { log } from "./log";

declare global {
  // eslint-disable-next-line no-var
  var __agentOfficeSleepInhibitProc: ChildProcess | null | undefined;
  // eslint-disable-next-line no-var
  var __agentOfficeSleepInhibitCount: number | undefined;
}

function getCount(): number {
  return globalThis.__agentOfficeSleepInhibitCount ?? 0;
}

function setCount(n: number) {
  globalThis.__agentOfficeSleepInhibitCount = n;
}

function getProc(): ChildProcess | null {
  return globalThis.__agentOfficeSleepInhibitProc ?? null;
}

function setProc(p: ChildProcess | null) {
  globalThis.__agentOfficeSleepInhibitProc = p;
}

function startInhibit() {
  if (process.platform !== "linux") return;
  try {
    const proc = spawn(
      "systemd-inhibit",
      ["--what=sleep:idle", "--who=Agent Office", "--why=Agent is running", "--mode=block", "sleep", "infinity"],
      { stdio: "ignore", detached: false },
    );
    proc.on("error", (err) => {
      log.warn("sleep_inhibit.spawn_error", { code: (err as NodeJS.ErrnoException).code });
      if (getProc() === proc) setProc(null);
    });
    proc.unref();
    proc.on("exit", () => {
      if (getProc() !== proc) return;
      setProc(null);
      // Restart the inhibitor if runs are still active (proc died unexpectedly).
      if (getCount() > 0) startInhibit();
    });
    setProc(proc);
    log.info("sleep_inhibit.acquired");
  } catch {
    log.warn("sleep_inhibit.unavailable");
  }
}

function stopInhibit() {
  const proc = getProc();
  if (!proc) return;
  try { proc.kill(); } catch { /* already gone */ }
  setProc(null);
  log.info("sleep_inhibit.released");
}

export function acquireInhibit() {
  const next = getCount() + 1;
  setCount(next);
  if (next === 1) startInhibit();
}

export function releaseInhibit() {
  const next = Math.max(0, getCount() - 1);
  setCount(next);
  if (next === 0) stopInhibit();
}

export function forceReleaseInhibit() {
  setCount(0);
  stopInhibit();
}
