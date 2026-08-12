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
    <div className="flex bg-bg-2 border border-line p-[3px] max-[600px]:hidden rounded-md">
      {SCOPES.map((s) => (
        <button
          key={s}
          className={cn("bg-transparent border-none cursor-pointer text-txt-3 px-[11px] py-[4px] rounded-[6px] text-[12px] font-[var(--font-mono)]", scope === s && "bg-bg-3 text-txt [box-shadow:inset_0_0_0_1px_var(--line)]")}
          onClick={() => setScope(s)}
          type="button"
        >
          {s.charAt(0).toUpperCase() + s.slice(1)}
        </button>
      ))}
    </div>
  );
}
