import { dayLabel, formatCost, type RunsByDay } from "../format/format-run-meta";
import { fmtTok } from "../format/activity-formatters";

export function ActivityDayHeader({ group }: { group: RunsByDay }) {
  const dayCost = group.runs.reduce((s, r) => s + r.cost, 0);
  const dayTok = group.runs.reduce((s, r) => s + r.tokensIn + r.tokensOut, 0);
  return (
    <div className="flex items-center text-txt-3 gap-[12px] px-[2px] pt-[12px] pb-[8px] font-[var(--font-mono)] text-[11px]">
      <span className="uppercase text-txt-2 font-semibold tracking-[0.08em]">{dayLabel(group.day)}</span>
      <span className="bg-bg-2 border border-line text-txt-2 rounded-full px-[8px] py-[1px]">{group.runs.length} runs</span>
      <span className="flex-1 h-[1px] bg-[var(--line)]" />
      <span className="text-txt-3 whitespace-nowrap">
        {formatCost(dayCost)} · {fmtTok(dayTok)} tok
      </span>
    </div>
  );
}
