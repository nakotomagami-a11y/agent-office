// Atomic writes via temp + rename, so a crash mid-flush leaves no half file.

import { mkdirSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

export function writeFileAtomic(path: string, data: string | Buffer): void {
  const dir = dirname(path);
  ensureDir(dir);
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmp, data);
  try {
    renameSync(tmp, path);
  } catch (err) {
    // The temp lands in a USER'S REPO; leaving it gets a failed write committed.
    rmSync(tmp, { force: true });
    throw err;
  }
}
