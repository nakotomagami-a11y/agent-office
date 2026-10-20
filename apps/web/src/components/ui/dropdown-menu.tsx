"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Portal } from "@/components/ui/portal";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { scrollMovesAnchor } from "@/lib/scroll-moves-anchor";

/** Focus is in an open menu, or on the trigger of one: the menu owns Escape, Enter and Tab there. */
export const OPEN_MENU_SELECTOR = "[role=menu], [aria-haspopup=menu][aria-expanded=true]";

export type DropdownItem = {
  key: string;
  label: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  /** Marks the currently-chosen option: stays purple/ink regardless of hover. */
  selected?: boolean;
  /**
   * How `selected` is rendered. `"fill"` (default) paints the whole row with
   * the accent background — good for single-choice filters/segments. `"check"`
   * instead shows a small checkmark before the label and leaves the row's
   * background to normal hover behaviour — for identity/account pickers where
   * the active row shouldn't look permanently pressed.
   */
  indicatorStyle?: "fill" | "check";
};

export type DropdownMenuProps = {
  trigger: ReactNode;
  items: DropdownItem[];
  ariaLabel?: string;
  align?: "start" | "end";
  triggerClassName?: string;
  /** Applied to the inline-block wrapper — e.g. `flex-1` to fill a flex row. */
  className?: string;
  /**
   * Size the popup to exactly match the trigger's own width instead of
   * shrink-wrapping to content. Use for `w-full` triggers (e.g. the
   * Environment-card account pickers) where a narrower popup reads as
   * visually disconnected from the row that opened it. Leave off for compact
   * triggers (inline model/effort pickers, filter chips) where the trigger is
   * much narrower than a usable menu.
   */
  matchTriggerWidth?: boolean;
  /** The trigger button's accessible name, when its visible text alone doesn't say what it picks. */
  triggerAriaLabel?: string;
};

export function DropdownMenu({ trigger, items, ariaLabel, align = "end", triggerClassName, className, matchTriggerWidth, triggerAriaLabel }: DropdownMenuProps) {
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
      ...(matchTriggerWidth ? { width: rect.width } : {}),
      maxHeight: `${Math.max(120, (openUp ? rect.top : spaceBelow) - 12)}px`,
      overflowY: "auto",
      ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      ...(align === "end" ? { right: window.innerWidth - rect.right } : { left: rect.left }),
    });
  }, [open, align, items.length, matchTriggerWidth]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const close = () => setOpen(false);
    // The menu is position:fixed, so it only detaches when something holding
    // the trigger scrolls — not the menu's own list or a sibling scroller.
    const onScroll = (e: Event) => {
      if (scrollMovesAnchor(e, triggerRef.current)) setOpen(false);
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

  // Menu-button pattern: opening moves focus to the chosen item (else the first enabled one), and
  // the arrow keys carry focus along, so keys reach the menu even though it is portalled away from its trigger.
  const firstIndex = () => {
    const chosen = items.findIndex((it) => it.selected && !it.disabled);
    return chosen >= 0 ? chosen : Math.max(0, items.findIndex((it) => !it.disabled));
  };
  const openIndex = useRef(0);
  const openMenu = () => {
    openIndex.current = firstIndex();
    setActiveIndex(openIndex.current);
    setOpen(true);
  };
  // Focus without the browser's centre-scroll: in a list taller than the menu that scroll slides a new
  // row under a still pointer, whose mouseenter moves focus again, and the list runs away. A keyboard
  // move scrolls just enough to show the row; a pointer move never scrolls.
  const focusItem = (i: number, fromPointer = false) => {
    setActiveIndex(i);
    const el = menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]")[i];
    el?.focus({ preventScroll: true });
    if (!fromPointer) el?.scrollIntoView({ block: "nearest" });
  };
  // A callback ref, not an effect: Portal mounts the menu a render after `open` flips.
  const attachMenu = useCallback((el: HTMLDivElement | null) => {
    menuRef.current = el;
    const item = el?.querySelectorAll<HTMLElement>("[role=menuitem]")[openIndex.current];
    item?.focus({ preventScroll: true });
    item?.scrollIntoView({ block: "nearest" });
  }, []);
  const step = (from: number, dir: 1 | -1) => {
    for (let n = 1; n <= items.length; n++) {
      const i = (from + dir * n + items.length) % items.length;
      if (!items[i]?.disabled) return i;
    }
    return from;
  };

  const closeToTrigger = (e: React.KeyboardEvent) => {
    // React's root listener sits on `document` (Next App Router) and is registered first, so
    // stopImmediatePropagation keeps this key from later document/window bubble listeners (the agent
    // inspector closes on Escape there). Capture-phase listeners still run before it.
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (open && e.key === "Escape") closeToTrigger(e);
    else if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); openMenu(); }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" || e.key === "Tab") {
      closeToTrigger(e);
      return;
    }
    // Keys the menu handles stop here: the office camera pans on window-level arrow keys.
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      focusItem(step(activeIndex, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      const item = items[activeIndex];
      if (item && !item.disabled) {
        item.onSelect();
        setOpen(false);
        triggerRef.current?.focus();
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
        aria-label={triggerAriaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onTriggerKey}
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
            ref={attachMenu}
            id={id}
            role="menu"
            aria-label={ariaLabel}
            onKeyDown={onKey}
            className={cn("surface-sheen rounded-md shadow-[var(--lift)] p-1 z-[9999]", !matchTriggerWidth && "min-w-[180px]")}
            style={style}
          >
            {items.map((item, i) => {
              const checkIndicator = item.indicatorStyle === "check";
              const fillSelected = item.selected && !checkIndicator;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  tabIndex={i === activeIndex ? 0 : -1}
                  disabled={item.disabled}
                  onClick={() => {
                    item.onSelect();
                    setOpen(false);
                  }}
                  onPointerMove={() => { if (i !== activeIndex && !item.disabled) focusItem(i, true); }}
                  className={cn(
                  "flex items-center gap-[10px] h-[34px] px-[10px] rounded-sm text-[13px] text-txt-2 cursor-pointer border-none bg-transparent font-[inherit] text-left no-underline w-full outline-none",
                  item.destructive && "text-status-error",
                  // `--txt` reads correctly on the accent fill in both themes;
                  // `[&_*]` forces nested label spans/icons to inherit it too.
                  fillSelected && "bg-acc text-txt [&_*]:!text-txt",
                  !fillSelected && i === activeIndex && "bg-bg-3 text-txt"
                )}
                >
                  {checkIndicator ? (
                    <span className="w-[12px] h-[12px] shrink-0 flex items-center justify-center">
                      {item.selected ? <Icon name="check" size={12} className="text-acc" /> : null}
                    </span>
                  ) : null}
                  {item.label}
                </button>
              );
            })}
          </div>
        </Portal>
      ) : null}
    </div>
  );
}
