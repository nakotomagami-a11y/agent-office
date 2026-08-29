"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TabItem<T extends string> = {
  value: T;
  label: ReactNode;
};

export type TabsProps<T extends string> = {
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (next: T) => void;
  ariaLabel?: string;
  className?: string;
};

export function Tabs<T extends string>({ items, value, onChange, ariaLabel, className }: TabsProps<T>) {
  const id = useId();
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("px-[18px] border-b border-line flex gap-1 bg-bg-1", className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            id={`${id}-${item.value}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            type="button"
            className={cn(
              "h-[38px] px-3 bg-transparent border-none cursor-pointer font-[inherit] text-[13px] font-medium border-b-2 border-transparent inline-flex items-center gap-[6px] hover:text-txt",
              active ? "text-txt border-b-acc" : "text-txt-3",
            )}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
