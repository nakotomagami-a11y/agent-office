import { Icon } from "@/components/ui/icon";
import type { PersistedRun } from "@agent-office/domain/types";
import { formatCost } from "../format/format-run-meta";
import { fmtTok, elapsedSince } from "../format/activity-formatters";

export function ActivityLiveRunMeta({ run }: { run: PersistedRun }) {
  return (
    <>
      <span className="inline-flex items-center bg-bg-2 border border-line rounded-full text-txt-2 whitespace-nowrap gap-[6px] px-[10px] py-[4px] font-[var(--font-mono)] text-[11px]">
        <Icon name="refresh" size={11} />
        running
      </span>
      <span className="text-txt-2 whitespace-nowrap font-[var(--font-mono)] text-[11px]">
        <span className="text-txt-3">elapsed </span>
        {elapsedSince(run.ts)}
      </span>
      <span className="text-txt-2 whitespace-nowrap font-[var(--font-mono)] text-[11px]">
        {fmtTok(run.tokensIn + run.tokensOut)} tok · {formatCost(run.cost)}
      </span>
    </>
  );
}
