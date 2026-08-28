import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import type { PersistedRun } from "@agent-office/domain/types";
import type { Filters } from "../derive/filter-runs";

type Status = PersistedRun["status"];

const STATUS_OPTIONS: Array<{ status: Status; label: string; dot: string }> = [
  { status: "done", label: "done", dot: "text-green" },
  { status: "error", label: "error", dot: "text-red" },
  { status: "running", label: "live", dot: "text-acc" },
];

function StatusButton({
  option,
  active,
  onToggle,
}: {
  option: (typeof STATUS_OPTIONS)[number];
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center bg-card-2 border border-edge text-txt-3 cursor-pointer gap-[6px] px-[11px] py-[7px] rounded-[10px] text-[12.5px] hover:text-txt hover:border-acc-line",
        active && "bg-acc-soft text-acc border-acc-line",
      )}
      onClick={onToggle}
      type="button"
      aria-pressed={active}
    >
      <span className={cn("rounded-full w-[6px] h-[6px] bg-current", option.dot)} />
      {option.label}
    </button>
  );
}

export function ActivityFilterBar({
  filters,
  setFilters,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
}) {
  const toggleStatus = (s: Status) => {
    const has = filters.statuses.includes(s);
    setFilters({
      ...filters,
      statuses: has ? filters.statuses.filter((x) => x !== s) : [...filters.statuses, s],
    });
  };

  return (
    <div className="flex items-center flex-wrap gap-[8px]">
      <div className="flex-1 flex items-center bg-card-2 border border-edge text-txt-4 min-w-[220px] gap-[10px] px-[13px] py-[9px] rounded-[13px] shadow-[var(--inset-hi)] focus-within:border-acc-line">
        <Icon name="search" size={14} />
        <input
          value={filters.query}
          onChange={(e) => setFilters({ ...filters, query: e.target.value })}
          placeholder="Search prompts, run IDs, agents…"
          className="flex-1 bg-transparent border-none text-txt outline-none text-[13.5px] placeholder:text-txt-4"
        />
        <kbd className="bg-card-3 text-txt-4 font-mono text-[10px] px-[5px] py-[1px] rounded-[4px]">/</kbd>
      </div>
      {STATUS_OPTIONS.map((option) => (
        <StatusButton
          key={option.status}
          option={option}
          active={filters.statuses.includes(option.status)}
          onToggle={() => toggleStatus(option.status)}
        />
      ))}
    </div>
  );
}
