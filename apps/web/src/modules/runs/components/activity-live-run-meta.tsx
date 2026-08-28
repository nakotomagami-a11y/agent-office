import { Icon } from "@/components/ui/icon";
import type { PersistedRun } from "@agent-office/domain/types";
import { formatCost } from "../format/format-run-meta";
import { fmtTok, elapsedSince } from "../format/activity-formatters";

export function ActivityLiveRunMeta({ run }: { run: PersistedRun }) {
  return (
    <>
      <span className="inline-flex items-center bg-card-2 rounded-full text-acc whitespace-nowrap gap-[6px] px-[10px] py-[4px] font-mono text-[11px] shrink-0">
        <Icon name="refresh" size={11} />
        running
      </span>
      <span className="text-txt-3 whitespace-nowrap font-mono text-[11px] shrink-0">
        <span className="text-txt-4">elapsed </span>
        {elapsedSince(run.ts)}
      </span>
      <span className="text-txt-3 whitespace-nowrap font-mono text-[11px] shrink-0">
        {fmtTok(run.tokensIn + run.tokensOut)} tok · {formatCost(run.cost)}
      </span>
    </>
  );
}
