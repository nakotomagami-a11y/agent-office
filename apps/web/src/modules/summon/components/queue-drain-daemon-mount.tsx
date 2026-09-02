"use client";

import { useQueueDrainDaemon } from "../hooks/use-queue-drain-daemon";

/**
 * Mount-once wrapper — no UI, just runs `useQueueDrainDaemon` for the
 * lifetime of the app shell so queued messages keep draining regardless of
 * which project tab is active. Same pattern as `RootSignInModal` /
 * `AgentCapModalMount`.
 */
export function QueueDrainDaemonMount() {
  useQueueDrainDaemon();
  return null;
}
