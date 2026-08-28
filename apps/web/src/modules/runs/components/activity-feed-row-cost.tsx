export function ActivityFeedRowCost({ cost, maxCost }: { cost: number; maxCost: number }) {
  return (
    <div className="flex-1 min-w-[60px] h-[4px] rounded-[2px] overflow-hidden bg-card-3">
      <div
        className="act-row-cost-fill h-full"
        style={{ width: `${Math.max(2, (cost / Math.max(maxCost, 0.001)) * 100)}%` }}
      />
    </div>
  );
}
