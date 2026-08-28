import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export type ActivityView = "log" | "insights";

export function ActivityViewTabs({
  view,
  setView,
}: {
  view: ActivityView;
  setView: (v: ActivityView) => void;
}) {
  const tabs: Array<{ id: ActivityView; label: string; icon: "book" | "gauge" }> = [
    { id: "log", label: "Log", icon: "book" },
    { id: "insights", label: "Insights", icon: "gauge" },
  ];
  return (
    <div role="group" aria-label="Activity view" className="flex items-center gap-[2px] p-[3px] rounded-[13px] bg-card-2 border border-edge shadow-[var(--inset-hi)] shrink-0">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={view === t.id}
          onClick={() => setView(t.id)}
          className={cn(
            "flex items-center gap-[6px] px-[12px] py-[6px] rounded-[10px] text-[11.5px] font-semibold whitespace-nowrap cursor-pointer transition-all duration-150",
            view === t.id
              ? "bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white shadow-[0_8px_18px_-10px_rgba(139,123,255,0.8)]"
              : "bg-transparent text-txt-3 hover:brightness-110",
          )}
        >
          <Icon name={t.icon} size={12} />
          {t.label}
        </button>
      ))}
    </div>
  );
}
