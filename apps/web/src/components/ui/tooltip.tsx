"use client";

import { useState, useRef, useCallback, useEffect, useId, isValidElement, cloneElement, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { assertNever } from "@/lib/assert-never";
import { cn } from "@/lib/cn";

type Side = "top" | "bottom" | "left" | "right";

export type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  side?: Side;
  /** Delay before the tooltip appears (ms). Default 450. */
  delayMs?: number;
  /**
   * Classes for the wrapping `<span>`, not the child. Needed whenever the
   * child is itself a flex/grid item and depends on a layout class like
   * `shrink-0` or `flex-1` — that class has to move to this wrapper, since
   * wrapping introduces a new box and the *wrapper* is now the actual flex
   * item as far as the parent's layout is concerned. Leave the child's own
   * classes for its own visual styling (color, padding, hover state) only.
   */
  className?: string;
};

const GAP = 8;

function calcStyle(rect: DOMRect, side: Side): CSSProperties {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  switch (side) {
    case "top": return { position: "fixed", left: cx, top: rect.top - GAP, transform: "translateX(-50%) translateY(-100%)" };
    case "bottom": return { position: "fixed", left: cx, top: rect.bottom + GAP, transform: "translateX(-50%)" };
    case "left": return { position: "fixed", left: rect.left - GAP, top: cy, transform: "translateX(-100%) translateY(-50%)" };
    case "right": return { position: "fixed", left: rect.right + GAP, top: cy, transform: "translateY(-50%)" };
    default: return assertNever(side);
  }
}

/**
 * The one tooltip in this app. Every hover/focus hint — icon-only buttons,
 * disabled-state explanations, truncated labels — should render through
 * this component rather than the native `title` attribute or a bespoke
 * hand-rolled popover. `title` gives you the browser's own tooltip (a
 * different font, timing, and position on every OS, and invisible to
 * keyboard/screen-reader users until they tab to the element and wait), and
 * a one-off popover is one more slightly-different design to maintain. This
 * is the only "how does a hint look" decision the app should make.
 *
 * Triggers on hover AND keyboard focus (`onFocus`/`onBlur` bubble through
 * React's synthetic event system same as `onMouseEnter`/`onMouseLeave`, so
 * putting them on the wrapping span works without cloning the child) and
 * dismisses on Escape, matching the WAI-ARIA tooltip pattern. When the
 * child is a single valid element, it's cloned with `aria-describedby`
 * pointing at the tooltip content so assistive tech announces the
 * relationship — not just sighted hover users.
 */
export function Tooltip({ content, children, side = "top", delayMs = 450, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();

  const show = useCallback(() => {
    timer.current = setTimeout(() => {
      const rect = ref.current?.getBoundingClientRect();
      if (rect) {
        setStyle(calcStyle(rect, side));
        setOpen(true);
      }
    }, delayMs);
  }, [side, delayMs]);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, { passive: true, capture: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (!content) return <>{children}</>;

  const trigger = isValidElement(children)
    ? cloneElement(children as React.ReactElement<{ "aria-describedby"?: string }>, {
        "aria-describedby": open ? id : undefined,
      })
    : children;

  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(e) => { if (e.key === "Escape") hide(); }}
      className={cn("inline-flex", className)}
    >
      {trigger}
      {open && typeof document !== "undefined" && createPortal(
        <div
          id={id}
          role="tooltip"
          style={style}
          className="z-[9999] px-2 py-[4px] rounded-[6px] text-[11.5px] font-medium leading-snug text-white bg-[#15161d] border border-[rgba(255,255,255,0.09)] shadow-[0_4px_14px_rgba(0,0,0,0.55)] pointer-events-none whitespace-nowrap"
        >
          {content}
        </div>,
        document.body,
      )}
    </span>
  );
}
