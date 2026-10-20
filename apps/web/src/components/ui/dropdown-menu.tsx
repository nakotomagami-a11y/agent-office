"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Portal } from "@/components/ui/portal";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { scrollMovesAnchor } from "@/lib/scroll-moves-anchor";

/** Focus is in an open menu, or on the trigger of one: the menu owns Escape, Enter, Space, Tab and the arrows there. */
export const OPEN_MENU_SELECTOR = "[role=menu], [aria-haspopup=menu][aria-expanded=true]";
const ITEM_SELECTOR = "[role^=menuitem]";

export type DropdownItem = {
  key: string;
  label: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  /** Marks the currently-chosen option: stays purple/ink regardless of hover. */
  selected?: boolean;
  /** `"fill"` (default) paints the chosen row with the accent, for filters/segments; `"check"` marks it
   *  with a checkmark instead, for identity/account pickers whose active row shouldn't look pressed. */
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
  /** Popup as wide as the trigger, for `w-full` triggers where a narrower one reads as detached from
   *  its row. Leave off for compact triggers, which are narrower than a usable menu. */
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

  // Focus moves into the menu (chosen row, else first enabled) so keys reach it though it is portalled.
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
  // No centre-scroll: it slides a new row under a still pointer, which focuses it, and the list runs away.
  const focusItem = (i: number, fromPointer = false) => {
    if (i < 0) return;
    setActiveIndex(i);
    const el = menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR)[i];
    el?.focus({ preventScroll: true });
    if (!fromPointer) el?.scrollIntoView({ block: "nearest" });
  };
  // A callback ref, not an effect: Portal mounts the menu a render after `open` flips.
  const attachMenu = useCallback((el: HTMLDivElement | null) => {
    menuRef.current = el;
    const item = el?.querySelectorAll<HTMLElement>(ITEM_SELECTOR)[openIndex.current];
    item?.focus({ preventScroll: true });
    item?.scrollIntoView({ block: "nearest" });
  }, []);
  /** The next enabled row after `from` in `dir`, wrapping; -1 when none is enabled. */
  const step = (from: number, dir: 1 | -1) => {
    for (let n = 1; n <= items.length; n++) {
      const i = (((from + dir * n) % items.length) + items.length) % items.length;
      if (!items[i]?.disabled) return i;
    }
    return -1;
  };
  // Focus follows React keys, not indexes: a list refetched while open must not act on another row.
  const focusedIndex = (e: React.KeyboardEvent) => {
    const rows = menuRef.current ? Array.from(menuRef.current.querySelectorAll(ITEM_SELECTOR)) : [];
    const i = rows.indexOf(e.target as never);
    return i >= 0 ? i : Math.min(activeIndex, items.length - 1);
  };
  const choose = (i: number) => {
    const item = items[i];
    if (!item || item.disabled) return;
    item.onSelect();
    setOpen(false);
    triggerRef.current?.focus();
  };

  const closeToTrigger = (e: React.KeyboardEvent) => {
    // React's root listener on `document` is registered first, so this keeps the key from later bubble
    // listeners (the inspector closes on Escape). Capture listeners still run before it.
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    setOpen(false);
    triggerRef.current?.focus();
  };

  // With no enabled row the trigger keeps focus, so it owns every key OPEN_MENU_SELECTOR claims.
  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (open && (e.key === "Escape" || e.key === "Tab")) closeToTrigger(e);
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      // Keys the menu handles stop here: the office camera pans on window-level arrow keys.
      e.preventDefault();
      e.stopPropagation();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      if (open) focusItem(step(activeIndex - dir, dir));
      else openMenu();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      if (open) setOpen(false);
      else openMenu();
    }
  };
  // Firefox clicks on Space keyup despite a prevented keydown; Space already acted on keydown, wherever keyup lands.
  const preventSpaceKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === " ") e.preventDefault();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" || e.key === "Tab") {
      closeToTrigger(e);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      focusItem(step(focusedIndex(e), e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      choose(focusedIndex(e));
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
        onKeyUp={preventSpaceKeyUp}
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
            onKeyUp={preventSpaceKeyUp}
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
                  role={item.selected === undefined ? "menuitem" : "menuitemradio"}
                  aria-checked={item.selected === undefined ? undefined : item.selected}
                  tabIndex={i === activeIndex ? 0 : -1}
                  disabled={item.disabled}
                  onClick={() => choose(i)}
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
