"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * The app's one hover-triggered *interactive* popover — for rich hover cards
 * (roster / project quick-views) that need to hold buttons. Fills the gap
 * between `Tooltip` (hover but `pointer-events:none`) and `Popover`
 * (interactive but click-triggered). Key decisions:
 *  - Trigger is a render-prop wired straight onto the row's own element, no
 *    wrapper box — a wrapping div made Chromium fire spurious `mouseleave`
 *    on unrelated DOM mutations, flickering the card closed.
 *  - Position computed once at show time from `getBoundingClientRect()`,
 *    flipping up when the trigger is near the viewport bottom (`openUp`).
 *  - Module-level single-flight guard: only one card open at a time.
 *  - `maxHeight` is passed to `panel()` so the caller's own bordered box
 *    scrolls, not the invisible portal wrapper (which would detach the
 *    scrollbar from the card edge).
 */

export type HoverCardTrigger = {
  ref: (el: HTMLElement | null) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

/** `right` — beside the trigger (for vertical row lists, e.g. the roster).
 *  `bottom` — below the trigger (for horizontal strips like a tab bar, where
 *  a side-anchored card would cover neighbouring triggers). */
export type HoverCardPlacement = "right" | "bottom";

export interface HoverCardProps {
  /** Panel width in px — also drives the flip math. Default 336. */
  width?: number;
  placement?: HoverCardPlacement;
  /** Panel content. Receives a `close` callback for actions that should
   *  dismiss the card (same convention as `Popover`), and the `maxHeight`
   *  (px) the card has room for — apply it (with `overflow-y:auto`) to the
   *  card's own root element so IT is what scrolls, not an invisible
   *  ancestor. Only rendered while open, so any data fetch inside only
   *  ever runs while the card is shown. */
  panel: (args: { close: () => void; maxHeight: number }) => ReactNode;
  /** Render-prop — see the trigger-wiring note above. */
  children: (trigger: HoverCardTrigger) => ReactNode;
}

const OPEN_DELAY_MS = 260;
const CLOSE_DELAY_MS = 220;
const VIEWPORT_GAP = 10;
const DEFAULT_MAX_HEIGHT = 200;
/** Hard ceiling on how tall a card can grow, even when the trigger sits
 *  somewhere with room to spare all the way to the viewport edge — leaves
 *  a visible margin top/bottom instead of stretching edge-to-edge. */
const MAX_HEIGHT_RATIO = 0.8;

/** Set by whichever `HoverCard` is currently showing. */
let closeOtherHoverCard: (() => void) | null = null;

function clampMaxHeight(available: number): number {
  return Math.min(window.innerHeight * MAX_HEIGHT_RATIO, Math.max(DEFAULT_MAX_HEIGHT, available));
}

function calcPlacement(rect: DOMRect, width: number, placement: HoverCardPlacement): { style: CSSProperties; maxHeight: number } {
  if (placement === "bottom") {
    const left = Math.min(Math.max(VIEWPORT_GAP, rect.left), window.innerWidth - width - VIEWPORT_GAP);
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_GAP;
    const spaceAbove = rect.top - VIEWPORT_GAP;
    const openUp = spaceBelow < 320 && spaceAbove > spaceBelow;
    const maxHeight = clampMaxHeight(openUp ? spaceAbove : spaceBelow);
    return {
      maxHeight,
      style: {
        position: "fixed",
        left,
        zIndex: 420,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + VIEWPORT_GAP }
          : { top: rect.bottom + VIEWPORT_GAP }),
      },
    };
  }

  const overflowsRight = rect.right + VIEWPORT_GAP + width > window.innerWidth - VIEWPORT_GAP;
  const left = overflowsRight
    ? Math.max(VIEWPORT_GAP, rect.left - width - VIEWPORT_GAP)
    : rect.right + VIEWPORT_GAP;

  const spaceBelow = window.innerHeight - rect.top - VIEWPORT_GAP;
  const spaceAbove = rect.bottom - VIEWPORT_GAP;
  const openUp = spaceBelow < 320 && spaceAbove > spaceBelow;
  const maxHeight = clampMaxHeight(openUp ? spaceAbove : spaceBelow);

  return {
    maxHeight,
    style: {
      position: "fixed",
      left,
      zIndex: 420,
      ...(openUp
        ? { bottom: window.innerHeight - rect.bottom }
        : { top: rect.top }),
    },
  };
}

export function HoverCard({ width = 336, placement = "right", panel, children }: HoverCardProps) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const [maxHeight, setMaxHeight] = useState(DEFAULT_MAX_HEIGHT);
  const elRef = useRef<HTMLElement | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const close = useCallback(() => setOpen(false), []);

  const scheduleShow = useCallback(() => {
    clearTimeout(hideTimer.current);
    showTimer.current = setTimeout(() => {
      const rect = elRef.current?.getBoundingClientRect();
      if (!rect) return;
      const placed = calcPlacement(rect, width, placement);
      setStyle(placed.style);
      setMaxHeight(placed.maxHeight);
      closeOtherHoverCard?.();
      closeOtherHoverCard = close;
      setOpen(true);
    }, OPEN_DELAY_MS);
  }, [close, width, placement]);

  const scheduleHide = useCallback(() => {
    clearTimeout(showTimer.current);
    hideTimer.current = setTimeout(close, CLOSE_DELAY_MS);
  }, [close]);

  const cancelHide = useCallback(() => clearTimeout(hideTimer.current), []);

  useEffect(() => () => {
    clearTimeout(showTimer.current);
    clearTimeout(hideTimer.current);
    if (closeOtherHoverCard === close) closeOtherHoverCard = null;
  }, [close]);

  useEffect(() => {
    if (!open) return;
    // Close when the page scrolls under the trigger (anchor goes stale), but
    // not when the card's own content scrolls — the capture-phase listener
    // sees both, so ignore scrolls targeting inside the card.
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target instanceof Node && wrapRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const setRef = useCallback((el: HTMLElement | null) => { elRef.current = el; }, []);

  return (
    <>
      {children({ ref: setRef, onMouseEnter: scheduleShow, onMouseLeave: scheduleHide })}
      {open && typeof document !== "undefined" && createPortal(
        <div ref={wrapRef} style={{ ...style, width }} onMouseEnter={cancelHide} onMouseLeave={scheduleHide}>
          {panel({ close, maxHeight })}
        </div>,
        document.body,
      )}
    </>
  );
}
