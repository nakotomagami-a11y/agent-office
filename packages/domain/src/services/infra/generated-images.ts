// Look up the files one imggen job wrote under GENERATED_IMAGES_DIR/<date>/
// (`HH-MM-SS_<slug>_<seed>.png`). imggen renames each file into place only once
// it is fully written, so anything listed here is safe to serve.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  GENERATED_IMAGE_DATE,
  GENERATED_IMAGE_SLUG,
  MAX_IMAGES_PER_JOB,
  MAX_JOBS_PER_COMMAND,
  type GeneratedImageRef,
} from "../../config/generated-images";
import { GENERATED_IMAGES_DIR } from "./paths";

/** `sinceMs`: when the tool call that ran imggen started — no file of this job is older. */
export interface GeneratedImageQuery {
  slug: string;
  sinceMs: number;
  /** When that tool call returned: a later file belongs to some later run. Unset
   *  while it runs, and for a backgrounded job, which outlives its call. */
  untilMs?: number;
  /** Known seeds, one per slot; null when imggen chose a random one. */
  seeds: number[] | null;
}

const DAY_MS = 86_400_000;
// Polled every 1.5s while a job runs, so each call scans only about a week of folders.
const MAX_SINCE_AGE_MS = 7 * DAY_MS;

/** Real date directories only — a symlinked or plain-file "date" is skipped. */
function dateDirsNewestFirst(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && GENERATED_IMAGE_DATE.test(d.name))
      .map((d) => d.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function jobFiles(root: string, date: string, re: RegExp): Array<{ seed: number; filename: string }> {
  let names: string[];
  try {
    names = readdirSync(join(root, date));
  } catch {
    return [];
  }
  return names
    .sort()
    .reverse()
    .flatMap((filename) => {
      const m = re.exec(filename);
      return m ? [{ seed: Number(m[1]), filename }] : [];
    });
}

function mtimeOf(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return -1;
  }
}

/**
 * This job's files: written in [`sinceMs`, `untilMs`] (`sinceMs` at most a week
 * back), so an older run or a later re-run of the same slug+seed never stands in
 * for it — though with no `untilMs` yet, a re-run's file can until it arrives.
 * Seeds known: the oldest such file per seed, in seed order. Seeds unknown: the
 * oldest such files of this slug, in write order. Two same-slug jobs that start
 * together (parallel tool calls, or one still running in the background) can't be
 * told apart this way.
 */
export function findGeneratedImages(query: GeneratedImageQuery, root = GENERATED_IMAGES_DIR): GeneratedImageRef[] {
  if (!GENERATED_IMAGE_SLUG.test(query.slug)) return [];
  const re = new RegExp(`^\\d{2}-\\d{2}-\\d{2}_${query.slug}_(\\d+)\\.png$`);
  // Refused rather than clamped: moving `since` forward would match a later run.
  if (query.sinceMs < Date.now() - MAX_SINCE_AGE_MS) return [];
  const sinceMs = query.sinceMs;
  const untilMs = query.untilMs ?? Infinity;
  const oldestDate = new Date(sinceMs - DAY_MS).toISOString().slice(0, 10);
  const newestDate = new Date(Math.min(untilMs, Date.now()) + DAY_MS).toISOString().slice(0, 10);
  const files = dateDirsNewestFirst(root)
    .filter((date) => date >= oldestDate && date <= newestDate)
    .flatMap((date) => jobFiles(root, date, re).map((f) => ({ ...f, date, mtime: mtimeOf(join(root, date, f.filename)) })))
    .filter((f) => f.mtime >= sinceMs && f.mtime <= untilMs)
    .sort((a, b) => a.mtime - b.mtime);
  const picked = query.seeds
    ? query.seeds.slice(0, MAX_IMAGES_PER_JOB).flatMap((seed) => files.find((f) => f.seed === seed) ?? [])
    : files.slice(0, MAX_IMAGES_PER_JOB * MAX_JOBS_PER_COMMAND);
  return picked.map(({ seed, date, filename }) => ({ seed, date, filename }));
}
