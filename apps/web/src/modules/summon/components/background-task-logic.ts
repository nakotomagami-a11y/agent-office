import type { ProcessInfo } from "@agent-office/domain/types";
import { extractBashCommand, isBackgroundBash } from "../format/message-format";
import type { ThreadItem } from "../format/thread-types";

export type BackgroundTask = { id: string; command: string; runId?: string };

export function findLatestBackgroundTask(thread: ThreadItem[]): BackgroundTask | null {
  for (let i = thread.length - 1; i >= 0; i--) {
    const item = thread[i]!;
    if (item.kind === "agent-tool" && isBackgroundBash(item.name, item.arg)) {
      return { id: item.id, command: extractBashCommand(item.arg!), runId: item.runId };
    }
  }
  return null;
}

/** Real check against /api/processes (PID liveness, not a guess) — true when
 *  some tracked background shell still alive right now belongs to this run. */
export function isBackgroundShellAlive(processes: ProcessInfo[], runId: string | undefined): boolean {
  if (!runId) return false;
  return processes.some((p) => p.source === "background-task" && p.runId === runId);
}
