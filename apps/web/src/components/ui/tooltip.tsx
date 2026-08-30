"use client";

import { useState, useRef, useCallback, useEffect, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { assertNever } from "@/lib/assert-never";

type Side = "top" | "bottom" | "left" | "right";

export type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  side?: Side;
  /** Delay before the tooltip appears (ms). Default 450. */
  delayMs?: number;
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

export function Tooltip({ content, children, side = "top", delayMs = 450 }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  return (
    <span ref={ref} onMouseEnter={show} onMouseLeave={hide} style={{ display: "inline-flex" }}>
      {children}
      {open && typeof document !== "undefined" && createPortal(
        <div
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
