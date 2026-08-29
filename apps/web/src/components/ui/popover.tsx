"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Portal } from "@/components/ui/portal";
import { cn } from "@/lib/cn";

export type PopoverProps = {
  /** Content rendered inside the trigger <button>. */
  trigger: ReactNode;
  /** Panel content. Receives a `close` callback for actions that should dismiss. */
  children: (args: { close: () => void }) => ReactNode;
  ariaLabel?: string;
  align?: "start" | "end";
  /** Fixed panel width in px. Defaults to 320. */
  width?: number;
  triggerClassName?: string;
  panelClassName?: string;
  /** Applied to the inline-block wrapper — e.g. `flex-1` to fill a flex row. */
  className?: string;
};

/**
 * Lightweight popover: a trigger button + an arbitrary portalled panel. Shares
 * the DropdownMenu contract (portal to <body> so it escapes `overflow-hidden`
 * ancestors, flip-up when short on space, close on outside-click / Esc / page
 * scroll) but holds free-form content instead of a list of menu items.
 */
export function Popover({
  trigger,
  children,
  ariaLabel,
  align = "start",
  width = 320,
  triggerClassName,
  panelClassName,
  className,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelH = panelRef.current?.offsetHeight ?? 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < panelH + 8 && rect.top > spaceBelow;
    setStyle({
      position: "fixed",
      maxHeight: `${Math.max(200, (openUp ? rect.top : spaceBelow) - 12)}px`,
      overflowY: "auto",
      overflowX: "hidden",
      width,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
      ...(align === "end"
        ? { right: window.innerWidth - rect.right }
        : { left: Math.min(rect.left, window.innerWidth - width - 12) }),
    });
  }, [open, align, width]);

  // Move focus into the panel once it's open so keyboard users land inside it.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      // Don't close when the click lands in a nested portalled overlay (e.g. a
      // DropdownMenu / Select rendered to <body>): those escape panelRef but are
      // logically part of this popover's interaction.
      if (t instanceof Element && t.closest('[role="menu"],[role="listbox"],[role="dialog"]')) {
        return;
      }
      setOpen(false);
    };
    const onScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (t && panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onClick);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-[6px] bg-transparent border border-transparent cursor-pointer font-[inherit]",
          triggerClassName,
        )}
      >
        {trigger}
      </button>
      {open ? (
        <Portal>
          <div
            ref={panelRef}
            id={id}
            role="dialog"
            aria-label={ariaLabel}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                close();
              }
            }}
            className={cn(
              "surface-sheen rounded-md shadow-[var(--lift)] z-[9999] outline-none",
              panelClassName,
            )}
            style={style}
          >
            {children({ close })}
          </div>
        </Portal>
      ) : null}
    </div>
  );
}
