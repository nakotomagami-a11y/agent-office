import type { Writable } from "node:stream";

interface ProcessRecord {
  lines: string[];
  exitCode: number | null;
  signal: string | null;
  createdAt: number;
}

declare global {
   
  var __aoProcessStore: Map<number, ProcessRecord> | undefined;
   
  var __aoStdinMap: Map<number, Writable> | undefined;
}

const MAX_LINES = 500;
const TTL_MS = 2 * 60 * 60 * 1000;

function getStore(): Map<number, ProcessRecord> {
  if (!globalThis.__aoProcessStore) globalThis.__aoProcessStore = new Map();
  return globalThis.__aoProcessStore;
}

function getStdinMap(): Map<number, Writable> {
  if (!globalThis.__aoStdinMap) globalThis.__aoStdinMap = new Map();
  return globalThis.__aoStdinMap;
}

export function registerProcess(pid: number) {
  getStore().set(pid, { lines: [], exitCode: null, signal: null, createdAt: Date.now() });
}

export function registerStdin(pid: number, stdin: Writable) {
  getStdinMap().set(pid, stdin);
}

export function writeStdin(pid: number, data: string): boolean {
  const s = getStdinMap().get(pid);
  if (!s || s.destroyed) return false;
  s.write(data);
  return true;
}

export function deleteStdin(pid: number) {
  getStdinMap().delete(pid);
}

export function appendLine(pid: number, line: string) {
  const rec = getStore().get(pid);
  if (!rec) return;
  rec.lines.push(line);
  if (rec.lines.length > MAX_LINES) rec.lines.shift();
}

export function setExited(pid: number, code: number | null, signal: string | null) {
  const rec = getStore().get(pid);
  if (rec) { rec.exitCode = code; rec.signal = signal; }
}

export function getProcess(pid: number): ProcessRecord | undefined {
  return getStore().get(pid);
}

export function deleteProcess(pid: number) {
  getStore().delete(pid);
}

setInterval(() => {
  const store = getStore();
  const cutoff = Date.now() - TTL_MS;
  for (const [pid, rec] of store) {
    if (rec.createdAt < cutoff) { store.delete(pid); continue; }
    try { process.kill(pid, 0); } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ESRCH") store.delete(pid);
    }
  }
}, 60_000).unref();
