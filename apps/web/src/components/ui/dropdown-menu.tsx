"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Portal } from "@/components/ui/portal";
import { cn } from "@/lib/cn";

export type DropdownItem = {
  key: string;
  label: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  /** Marks the currently-chosen option: stays purple/ink regardless of hover. */
  selected?: boolean;
};

export type DropdownMenuProps = {
  trigger: ReactNode;
  items: DropdownItem[];
  ariaLabel?: string;
  align?: "start" | "end";
  triggerClassName?: string;
  /** Applied to the inline-block wrapper — e.g. `flex-1` to fill a flex row. */
  className?: string;
};

export function DropdownMenu({ trigger, items, ariaLabel, align = "end", triggerClassName, className }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [style, setStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();

  // Portalled to <body> (see Tooltip for the same pattern) so the menu can
  // escape ancestors with `overflow-hidden` — e.g. the project hero card —
  // instead of being clipped by them.
  useEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Flip upward when there isn't room below the trigger (e.g. a dropdown at
    // the bottom of a modal), and cap the height to the available space so the
    // menu scrolls instead of spilling off-screen in either direction.
    const menuH = items.length * 34 + 12; // fixed 34px rows + padding
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuH + 8 && rect.top > spaceBelow;
    setStyle({
      position: "fixed",
      maxHeight: `${Math.max(120, (openUp ? rect.top : spaceBelow) - 12)}px`,
      overflowY: "auto",
      ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      ...(align === "end" ? { right: window.innerWidth - rect.right } : { left: rect.left }),
    });
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const close = () => setOpen(false);
    // Close when the PAGE scrolls (the menu is position:fixed and would detach
    // from its trigger) — but NOT when the user scrolls *inside* the menu's own
    // overflow area. The capture-phase listener sees inner scrolls too, so skip
    // any scroll whose target is within the menu.
    const onScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (t && menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIndex];
      if (item && !item.disabled) {
        item.onSelect();
        setOpen(false);
      }
    }
  };

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "h-[24px] px-[10px] inline-flex items-center gap-[6px] bg-transparent border border-transparent rounded-sm text-txt-2 font-[inherit] text-[12.5px] cursor-pointer hover:bg-bg-2 hover:border-line",
          triggerClassName,
        )}
      >
        {trigger}
      </button>
      {open ? (
        <Portal>
          <div
            ref={menuRef}
            id={id}
            role="menu"
            aria-label={ariaLabel}
            onKeyDown={onKey}
            className="min-w-[180px] bg-bg-1 border border-line rounded-[var(--r-md)] shadow-[var(--shadow-2)] p-1 z-[9999]"
            style={style}
          >
            {items.map((item, i) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  item.onSelect();
                  setOpen(false);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={cn(
                "flex items-center gap-[10px] h-[34px] px-[10px] rounded-[var(--r-sm)] text-[13px] text-txt-2 cursor-pointer border-none bg-transparent font-[inherit] text-left no-underline w-full",
                item.destructive && "text-status-error",
                // Selected sits on the accent (purple) fill. Use `--txt`, which
                // is near-white in dark theme and near-black in light theme, so
                // the label always reads on the purple. `[&_*]` forces nested
                // label spans/icons to inherit it too (they otherwise keep their
                // own muted colour and vanish on the fill).
                item.selected && "bg-acc text-txt [&_*]:!text-txt",
                !item.selected && i === activeIndex && "bg-bg-3 text-txt"
              )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </Portal>
      ) : null}
    </div>
  );
}
