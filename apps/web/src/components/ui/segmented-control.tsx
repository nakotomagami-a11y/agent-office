import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SegmentedControlItem<T extends string> = {
  value: T;
  label: ReactNode;
  /** Optional trailing mono count, e.g. category/tab counts. */
  count?: number | string;
};

export type SegmentedControlProps<T extends string> = {
  items: ReadonlyArray<SegmentedControlItem<T>>;
  value: T;
  onChange: (next: T) => void;
  ariaLabel?: string;
  /** Wrap onto multiple lines instead of a single scrollable row — use for
   *  category filters that can grow past the container width. */
  wrap?: boolean;
  className?: string;
};

/**
 * Pill-group toggle — the "sheen" strip of rounded buttons used for
 * Log/Insights, Upcoming/Recurring/History, All/Mine/GitHub, and category
 * filter chips alike. One component covers both 2-3-way tab switches and
 * multi-chip category filters with the same active/inactive treatment.
 */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  wrap = false,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "surface-sheen inline-flex items-center gap-0.5 p-[5px] rounded-2xl shadow-[var(--lift)]",
        wrap && "flex-wrap",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex items-center gap-[7px] px-[13px] py-[7px] rounded-xl text-[12.5px] font-semibold whitespace-nowrap cursor-pointer border-0 font-[inherit] transition-[filter,background,color] duration-150 hover:brightness-[1.06]",
              active
                ? "bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-acc-ink shadow-[0_8px_18px_-10px_color-mix(in_srgb,var(--acc)_65%,transparent)]"
                : "bg-transparent text-txt-3",
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className="font-mono text-[10px] opacity-70">{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
