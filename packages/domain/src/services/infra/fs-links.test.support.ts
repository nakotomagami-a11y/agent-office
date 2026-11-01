import { symlinkSync } from "node:fs";

/** Windows differs from POSIX here: no unprivileged symlinks, no chmod on directories, restricted names. */
export const ON_WINDOWS = process.platform === "win32";

/**
 * A directory link, or a dangling one: any link whose target is not a file.
 * The real symlink is tried first everywhere. Windows without Developer Mode
 * refuses it (EPERM); a junction needs no privilege, and Node reports it as a
 * symlink to lstat/readdir, with a missing target staying missing, so the code
 * under test sees the same thing it sees on POSIX. Remove the link itself before
 * any recursive delete of its parent.
 */
export function linkTo(target: string, path: string): void {
  try {
    symlinkSync(target, path, ON_WINDOWS ? "dir" : undefined);
  } catch (err) {
    if (!ON_WINDOWS || (err as NodeJS.ErrnoException).code !== "EPERM") throw err;
    symlinkSync(target, path, "junction");
  }
}
