import { cn } from "@/lib/cn";
import type { ActivityScope } from "../derive/filter-runs";

const SCOPES: ActivityScope[] = ["today", "week", "month", "all"];

export function ActivityScopeTabs({
  scope,
  setScope,
}: {
  scope: ActivityScope;
  setScope: (s: ActivityScope) => void;
}) {
  return (
    <div role="group" aria-label="Time window" className="flex items-center gap-[2px] p-[3px] rounded-[13px] bg-card-2 border border-edge shadow-[var(--inset-hi)] max-[600px]:hidden">
      {SCOPES.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={scope === s}
          className={cn(
            "px-[12px] py-[6px] rounded-[10px] text-[11.5px] font-semibold whitespace-nowrap cursor-pointer transition-all duration-150",
            scope === s
              ? "bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white shadow-[0_8px_18px_-10px_rgba(139,123,255,0.8)]"
              : "bg-transparent text-txt-3 hover:brightness-110",
          )}
          onClick={() => setScope(s)}
        >
          {s.charAt(0).toUpperCase() + s.slice(1)}
        </button>
      ))}
    </div>
  );
}
