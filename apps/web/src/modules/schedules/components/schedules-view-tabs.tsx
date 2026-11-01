import { cn } from "@/lib/cn";

import type { ScheduleView } from "../format/schedule-format";

export function SchedulesViewTabs({
  view,
  setView,
  counts,
}: {
  view: ScheduleView;
  setView: (v: ScheduleView) => void;
  counts: Record<ScheduleView, number>;
}) {
  const tabs: Array<{ id: ScheduleView; label: string }> = [
    { id: "upcoming", label: "Upcoming" },
    { id: "recurring", label: "Recurring" },
    { id: "history", label: "History" },
  ];
  return (
    <div role="group" aria-label="Schedule view" className="flex items-center gap-[2px] p-[3px] rounded-[13px] bg-card-2 border border-edge shadow-[var(--inset-hi)] w-fit">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={view === t.id}
          onClick={() => setView(t.id)}
          className={cn(
            "flex items-center gap-[6px] px-[12px] py-[6px] rounded-[10px] text-[11.5px] font-semibold whitespace-nowrap cursor-pointer transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc",
            view === t.id
              ? "bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white shadow-[0_8px_18px_-10px_rgba(139,123,255,0.8)]"
              : "bg-transparent text-txt-3 hover:brightness-110",
          )}
        >
          {t.label}
          <span className="font-mono text-[9.5px] opacity-75">{counts[t.id]}</span>
        </button>
      ))}
    </div>
  );
}
