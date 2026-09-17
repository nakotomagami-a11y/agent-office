"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useProcesses } from "@/modules/processes/hooks/use-processes";
import type { ThreadItem } from "../format/thread-types";
import { isBackgroundShellAlive, findLatestBackgroundTask, type BackgroundTask } from "./background-task-logic";

export type { BackgroundTask };
export { findLatestBackgroundTask } from "./background-task-logic";

/** Polls /api/processes (real PID liveness, 5s) for a shell owned by `runId`. */
export function useIsBackgroundTaskAlive(runId: string | undefined): boolean {
  const processesQ = useProcesses(!!runId);
  return isBackgroundShellAlive(processesQ.data ?? [], runId);
}

export function BackgroundTaskPill({ task, onDismiss }: { task: BackgroundTask; onDismiss: () => void }) {
  return (
    <div
      className="shrink-0 inline-flex items-center gap-[6px] h-7 px-[10px] rounded-lg bg-[color-mix(in_oklch,var(--ao-accent)_14%,transparent)] border border-[color-mix(in_oklch,var(--ao-accent)_32%,transparent)] text-[12px] text-[var(--ao-accent)]"
      title={`Command: ${task.command}`}
    >
      <Icon name="terminal-ao" size={12} className="shrink-0" />
      <span className="font-semibold whitespace-nowrap shrink-0">Shell running</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss background task notice"
        className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center leading-none hover:bg-[color-mix(in_oklch,var(--ao-accent)_25%,transparent)] transition-colors duration-[120ms]"
      >
        ×
      </button>
    </div>
  );
}

/** Pinned in ChatHead. Renders only for `<ChatPanel>` callers without `noHeader`
 *  (the primary modal reports the same signal via `onBackgroundTaskChange` instead). */
export function BackgroundTaskIndicator({ thread, resetKey }: { thread: ThreadItem[]; resetKey: string }) {
  const latest = useMemo(() => findLatestBackgroundTask(thread), [thread]);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const alive = useIsBackgroundTaskAlive(latest?.runId);

  useEffect(() => {
    setDismissedId(null);
  }, [resetKey]);

  if (!latest || latest.id === dismissedId || !alive) return null;
  return <BackgroundTaskPill task={latest} onDismiss={() => setDismissedId(latest.id)} />;
}
