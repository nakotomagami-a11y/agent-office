import { linkSync, symlinkSync } from "node:fs";

/** Windows differs from POSIX here: no unprivileged symlinks, no chmod on directories, restricted names. */
export const ON_WINDOWS = process.platform === "win32";

/**
 * A directory link, or a dangling one: any link whose target is not a file.
 * Windows refuses a plain symlink without Developer Mode or elevation (EPERM),
 * but a junction needs no privilege. Node reports it as a symlink to
 * lstat/readdir, and a missing target stays a missing target, so the code under
 * test sees the same thing it sees on POSIX.
 */
export function linkTo(target: string, path: string): void {
  symlinkSync(target, path, ON_WINDOWS ? "junction" : undefined);
}

/**
 * A second name for an existing file, for tests that check a write never goes
 * through to the original. The real attack is a symlink, so that is tried first
 * everywhere; only where the OS refuses it (Windows without Developer Mode,
 * EPERM) does it become a hard link. Both names then share the content, which is
 * exactly what an in-place write would corrupt, so the assertion still bites.
 */
export function aliasFile(target: string, path: string): void {
  try {
    symlinkSync(target, path);
  } catch (err) {
    if (!ON_WINDOWS || (err as NodeJS.ErrnoException).code !== "EPERM") throw err;
    linkSync(target, path);
  }
}
