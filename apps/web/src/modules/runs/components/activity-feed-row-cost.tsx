import { formatCost } from "../format/format-run-meta";

export function ActivityFeedRowCost({
  cost,
  maxCost,
}: {
  cost: number;
  maxCost: number;
}) {
  return (
    <div className="flex flex-col gap-[3px] font-[var(--font-mono)] text-[11px]">
      <div className="text-txt">{formatCost(cost)}</div>
      <div className="overflow-hidden bg-bg-3 h-[3px] rounded-[2px]">
        <div
          className="act-row-cost-fill h-full rounded-[2px]"
          style={{ width: `${Math.max(2, (cost / Math.max(maxCost, 0.001)) * 100)}%` }}
        />
      </div>
    </div>
  );
}
