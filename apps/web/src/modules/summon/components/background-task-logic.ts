import { extractBashCommand, isBackgroundBash } from "../format/message-format";
import type { ThreadItem } from "../format/thread-types";

export type BackgroundTask = { id: string; command: string; startedAt?: number };

export const BACKGROUND_TASK_EXPIRY_MS = 20 * 60_000;

/** `startedAt` undefined → never expires. */
export function isBackgroundTaskExpired(startedAt: number | undefined, now: number): boolean {
  if (startedAt === undefined) return false;
  return now - startedAt > BACKGROUND_TASK_EXPIRY_MS;
}

export function findLatestBackgroundTask(thread: ThreadItem[]): BackgroundTask | null {
  for (let i = thread.length - 1; i >= 0; i--) {
    const item = thread[i]!;
    if (item.kind === "agent-tool" && isBackgroundBash(item.name, item.arg)) {
      return { id: item.id, command: extractBashCommand(item.arg!), startedAt: item.ts };
    }
  }
  return null;
}
