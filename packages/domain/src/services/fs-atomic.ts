// Atomic file writes via temp + rename. Used for any persisted JSON we don't
// want to leave half-written if the process dies mid-flush.

import { mkdirSync, renameSync, writeFileSync, existsSync } from "node:fs";
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
  renameSync(tmp, path);
}
