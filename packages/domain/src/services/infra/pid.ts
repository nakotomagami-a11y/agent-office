/**
 * `kill(pid, 0)` sends no signal - it only probes existence. ESRCH means gone,
 * EPERM means alive but owned by another user.
 *
 * ponytail: PIDs can be recycled, so a dead run whose PID got reused stays
 * "running" until the 4h wall-clock cap in runs.ts sweeps it. Swap for a
 * pid+boot-time pair if that ever bites.
 */
export function isPidAlive(pid: number | null | undefined): boolean {
  // NULL = row predates the owner_pid column; treat as orphaned (old behaviour).
  if (pid == null || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}
