"use client";

import { useEffect, useRef, useState } from "react";
import { Portal } from "@/components/ui/portal";
import { Icon } from "@/components/ui/icon";

export type SelectFieldProps = {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
};

/**
 * Custom dropdown used for model / effort selection. Portal-rendered so the
 * options list can escape any overflow-clipping parent (the settings tab
 * scrolls internally). Closes on outside click.
 */
export function SelectField({ value, onChange, options }: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const openMenu = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="w-full flex items-center justify-between gap-2 text-left text-ao-fg-0 text-[13.5px] bg-transparent border-0 outline-none cursor-pointer"
      >
        <span className="font-mono">{value}</span>
        <Icon
          name="chevron-down"
          size={13}
          className={`text-ao-fg-2 shrink-0 transition-transform duration-[120ms] ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <Portal>
          <div
            ref={dropdownRef}
            className="fixed z-[300] bg-ao-bg-1 border border-ao-line-2 rounded-[var(--ao-radius-md)] shadow-[var(--ao-shadow-modal)] py-1"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            {options.map((opt) => (
              <SelectFieldRow key={opt} option={opt} selected={opt === value} onPick={() => { onChange(opt); setOpen(false); }} />
            ))}
          </div>
        </Portal>
      )}
    </>
  );
}

function SelectFieldRow({ option, selected, onPick }: { option: string; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`w-full text-left px-[10px] py-[7px] text-[12.5px] font-mono transition-[background,color] duration-[80ms] ${
        selected ? "bg-[var(--ao-accent-soft)] text-[var(--ao-accent)]" : "text-ao-fg-0 hover:bg-ao-bg-3"
      }`}
    >
      {option}
    </button>
  );
}
