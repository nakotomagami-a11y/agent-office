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
 * through to the original. A POSIX symlink is the real attack; a junction cannot
 * point at a file, and a Windows file symlink needs privilege, so there it is a
 * hard link: both names share the content, which is exactly what an in-place
 * write would corrupt.
 */
export function aliasFile(target: string, path: string): void {
  if (ON_WINDOWS) linkSync(target, path);
  else symlinkSync(target, path);
}

