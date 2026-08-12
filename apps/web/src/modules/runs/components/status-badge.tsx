import { Icon } from "@/components/ui/icon";
import type { PersistedRun } from "@agent-office/domain/types";

/**
 * Small pill showing a run's live status. Same set of statuses as
 * `PersistedRun["status"]` plus `"running"` for in-flight runs where the
 * persisted row hasn't finalized yet.
 *
 * Rendered inline in sub-agent trees, run detail headers, and the
 * workflow pill.
 */
export type SubAgentDisplayStatus = PersistedRun["status"] | "running";

export function StatusBadge({ status }: { status: SubAgentDisplayStatus }) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-[5px] font-mono text-[10px] tracking-[0.06em] uppercase text-[var(--ao-ok)] px-[7px] py-[1px] rounded-full border border-[rgba(78,185,111,0.25)] bg-[var(--ao-ok-soft)]">
        <span
          className="w-[5px] h-[5px] rounded-full bg-[var(--ao-ok)] animate-[ao-pulse_1.5s_infinite]"
          aria-hidden
        />
        running
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-[5px] font-mono text-[10px] tracking-[0.06em] uppercase text-[var(--ao-ok)] px-[7px] py-[1px] rounded-full border border-[rgba(78,185,111,0.25)] bg-[var(--ao-ok-soft)]">
        <Icon name="check" size={9} />
        done
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-[5px] font-mono text-[10px] tracking-[0.06em] uppercase text-[var(--ao-bad)] px-[7px] py-[1px] rounded-full border border-[rgba(217,83,79,0.25)] bg-[var(--ao-bad-soft)]">
      <Icon name="x" size={9} />
      error
    </span>
  );
}
