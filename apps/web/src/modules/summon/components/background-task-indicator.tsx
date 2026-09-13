"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { ThreadItem } from "../format/thread-types";
import { isBackgroundTaskExpired, findLatestBackgroundTask, type BackgroundTask } from "./background-task-logic";

export type { BackgroundTask };
export { BACKGROUND_TASK_EXPIRY_MS, isBackgroundTaskExpired, findLatestBackgroundTask } from "./background-task-logic";

/** Re-checks every 30s so the pill disappears on its own at the 20-min mark. */
export function useIsBackgroundTaskExpired(startedAt: number | undefined): boolean {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return isBackgroundTaskExpired(startedAt, now);
}

export function BackgroundTaskPill({ task, onDismiss }: { task: BackgroundTask; onDismiss: () => void }) {
  return (
    <div
      className="shrink-0 inline-flex items-center gap-[6px] h-7 px-[10px] rounded-lg bg-[color-mix(in_oklch,var(--ao-accent)_14%,transparent)] border border-[color-mix(in_oklch,var(--ao-accent)_32%,transparent)] text-[12px] text-[var(--ao-accent)]"
      title={`Command: ${task.command}\n\nNo live "is it still alive" status is available for this yet — this just confirms the agent started it, and clears itself after 20 minutes.`}
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
  const expired = useIsBackgroundTaskExpired(latest?.startedAt);

  useEffect(() => {
    setDismissedId(null);
  }, [resetKey]);

  if (!latest || latest.id === dismissedId || expired) return null;
  return <BackgroundTaskPill task={latest} onDismiss={() => setDismissedId(latest.id)} />;
}
