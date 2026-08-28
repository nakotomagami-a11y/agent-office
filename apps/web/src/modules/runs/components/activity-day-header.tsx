import { dayLabel, formatCost, type RunsByDay } from "../format/format-run-meta";
import { fmtTok } from "../format/activity-formatters";

export function ActivityDayHeader({ group }: { group: RunsByDay }) {
  const dayCost = group.runs.reduce((s, r) => s + r.cost, 0);
  const dayTok = group.runs.reduce((s, r) => s + r.tokensIn + r.tokensOut, 0);
  return (
    <div className="flex items-center text-txt-4 gap-[10px] px-[2px] pt-[14px] pb-[8px] font-mono text-[11px]">
      <span className="uppercase text-txt-2 font-extrabold tracking-[0.08em]">{dayLabel(group.day)}</span>
      <span className="bg-card-2 text-txt-3 rounded-full px-[8px] py-[1px]">{group.runs.length} runs</span>
      <span className="flex-1" />
      <span className="text-txt-4 whitespace-nowrap">
        {formatCost(dayCost)} · {fmtTok(dayTok)}
      </span>
    </div>
  );
}
