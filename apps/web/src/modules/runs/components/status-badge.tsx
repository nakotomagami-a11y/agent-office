import { Icon } from "@/components/ui/icon";
import type { PersistedRun } from "@agent-office/domain/types";

/**
 * Small pill showing a run's live status. Covers `PersistedRun["status"]`
 * plus the extra in-flight/terminal states a live sub-agent spawn can be in
 * before it lands in the `runs` table (`queued`, `cancelling`, `cancelled`,
 * `timeout`).
 *
 * Rendered inline in sub-agent trees, run detail headers, and the
 * workflow pill.
 */
export type SubAgentDisplayStatus = PersistedRun["status"] | "running" | "queued" | "cancelling" | "cancelled" | "timeout";

const BASE = "inline-flex items-center gap-[5px] font-mono text-[10px] tracking-[0.06em] uppercase px-[7px] py-[1px] rounded-full border";

export function StatusBadge({ status }: { status: SubAgentDisplayStatus }) {
  if (status === "running") {
    return (
      <span className={`${BASE} text-[var(--ao-ok)] border-[rgba(78,185,111,0.25)] bg-[var(--ao-ok-soft)]`}>
        <span className="w-[5px] h-[5px] rounded-full bg-[var(--ao-ok)] animate-[ao-pulse_1.5s_infinite]" aria-hidden />
        running
      </span>
    );
  }
  if (status === "queued") {
    return (
      <span className={`${BASE} text-ao-fg-2 border-ao-line-1 bg-ao-bg-3`}>
        <span className="w-[5px] h-[5px] rounded-full bg-ao-fg-3" aria-hidden />
        queued
      </span>
    );
  }
  if (status === "cancelling") {
    return (
      <span className={`${BASE} text-[var(--ao-warn)] border-[rgba(230,179,90,0.3)] bg-[var(--ao-warn-soft)]`}>
        <span className="w-[5px] h-[5px] rounded-full bg-[var(--ao-warn)] animate-[ao-pulse_1.5s_infinite]" aria-hidden />
        cancelling
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className={`${BASE} text-ao-fg-2 border-ao-line-1 bg-ao-bg-3`}>
        <Icon name="stop" size={9} />
        cancelled
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className={`${BASE} text-[var(--ao-ok)] border-[rgba(78,185,111,0.25)] bg-[var(--ao-ok-soft)]`}>
        <Icon name="check" size={9} />
        done
      </span>
    );
  }
  return (
    <span className={`${BASE} text-[var(--ao-bad)] border-[rgba(217,83,79,0.25)] bg-[var(--ao-bad-soft)]`}>
      <Icon name="x" size={9} />
      {status === "timeout" ? "timeout" : "error"}
    </span>
  );
}
