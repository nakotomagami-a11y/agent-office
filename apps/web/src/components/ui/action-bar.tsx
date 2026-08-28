"use client";

import { Fragment, useRef, useState, useEffect, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export type ActionBarAction = {
  key: string;
  element: ReactNode;
  segment?: string;
  priority?: number;
};

export type ActionBarDivider = { key: string; type: "divider" };
export type ActionBarItem = ActionBarAction | ActionBarDivider;

function isDivider(item: ActionBarItem): item is ActionBarDivider {
  return "type" in item && (item as ActionBarDivider).type === "divider";
}

// Overflow tolerance (px) — sub-pixel layout rounding must not trip collapse.
const TOL = 2;
// How far up the tree we look for the element that actually overflows.
const MAX_HOPS = 8;
// Debounce window for resize-driven re-measurement.
const RESIZE_DEBOUNCE_MS = 120;

/**
 * The ActionBar wrapper is `shrink-0` and typically lives inside an `ml-auto`
 * group whose siblings absorb the shortage (a `min-w-0` title that truncates),
 * so the wrapper's own parent never reports overflow. Climb ancestors and
 * return the nearest one whose content actually overflows its box — that is the
 * element we must measure. Returns null when nothing overflows.
 */
function findOverflowingAncestor(start: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = start;
  let hops = 0;
  while (node && hops < MAX_HOPS) {
    if (node.scrollWidth > node.clientWidth + TOL) return node;
    node = node.parentElement;
    hops++;
  }
  return null;
}

function debounce(fn: () => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return Object.assign(
    () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { t = null; fn(); }, ms);
    },
    { cancel: () => { if (t) { clearTimeout(t); t = null; } } },
  );
}

/**
 * Subscribes to every signal that can change whether the bar fits — a debounced
 * window resize, a ResizeObserver on the wrapper's ancestor chain, and (via the
 * caller's own render effect) content changes. `getTargets` is re-invoked on
 * each subscribe so the observed ancestor can shift as the layout collapses.
 */
function useReflowListener(
  wrapperRef: React.RefObject<HTMLDivElement | null>,
  runCheckRef: React.RefObject<() => void>,
) {
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const debounced = debounce(() => runCheckRef.current(), RESIZE_DEBOUNCE_MS);

    const observer = new ResizeObserver(() => debounced());
    // Observe the immediate parent plus the nearest overflowing/constraining
    // ancestor so width changes at either level re-trigger the check.
    const parent = el.parentElement;
    if (parent) observer.observe(parent);
    const container = findOverflowingAncestor(parent) ?? parent?.parentElement ?? null;
    if (container && container !== parent) observer.observe(container);

    window.addEventListener("resize", debounced);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", debounced);
      debounced.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Renders actions inline when the parent flex row has space; collapses to a
 * "⋯" dropdown when the row overflows. Wrap only the actions that should
 * participate in the collapse — fixed buttons (like "Add agent") stay outside.
 *
 * Pass `actions` for legacy all-or-nothing collapse.
 * Pass `items` for per-segment priority-based collapse: items with a `segment`
 * key collapse as a group; higher `priority` collapses first. Unsegmented items
 * never collapse. `{ type: "divider" }` items are hidden when both adjacent
 * segments are collapsed or absent.
 */
export function ActionBar(
  props: { actions: ActionBarAction[] } | { items: ActionBarItem[] },
) {
  if ("items" in props) return <ActionBarSegmented items={props.items} />;
  return <ActionBarLegacy actions={props.actions} />;
}

function ActionBarLegacy({ actions }: { actions: ActionBarAction[] }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  // `container` is the ancestor we locked onto at collapse time; we keep
  // measuring the SAME element so the restore threshold stays comparable.
  const stateRef = useRef({
    collapsed: false,
    collapseWidth: null as number | null,
    container: null as HTMLElement | null,
  });
  const runCheckRef = useRef<() => void>(() => {});
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);

  const runCheck = () => {
    const el = wrapperRef.current;
    if (!el) return;

    const s = stateRef.current;

    if (!s.collapsed) {
      const container = findOverflowingAncestor(el.parentElement);
      if (container) {
        s.container = container;
        s.collapseWidth = container.scrollWidth;
        s.collapsed = true;
        setCollapsed(true);
      }
    } else {
      const container = s.container;
      // Restore only when the locked container has grown enough to fit the
      // full natural width we recorded at collapse time.
      if (container && s.collapseWidth !== null && container.clientWidth > s.collapseWidth + TOL + 2) {
        s.collapsed = false;
        s.collapseWidth = null;
        s.container = null;
        setCollapsed(false);
      }
    }
  };
  runCheckRef.current = runCheck;

  // Re-check after every render (cheap — reads layout, no writes unless state flips).
  useEffect(() => { runCheck(); });
  useReflowListener(wrapperRef, runCheckRef);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={wrapperRef} className="shrink-0 flex items-center gap-2">
      {collapsed ? (
        <div ref={dropRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "inline-flex items-center justify-center w-8 h-8 rounded-[8px] border border-transparent text-txt-2 transition-[background,border-color,color] duration-[120ms] hover:bg-bg-2 hover:border-line hover:text-txt",
              open && "bg-bg-2 border-line text-txt",
            )}
            title="More actions"
          >
            <Icon name="more-horizontal" size={16} />
          </button>

          {open && (
            <div className="absolute top-[calc(100%+6px)] right-0 min-w-[200px] surface-sheen rounded-[14px] shadow-[var(--lift)] z-50 py-1 overflow-hidden">
              {actions.map((a) => (
                <div key={a.key} className="px-1.5 py-0.5 flex">
                  {a.element}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {actions.map((a) => a.element)}
        </>
      )}
    </div>
  );
}

function ActionBarSegmented({ items }: { items: ActionBarItem[] }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const segRef = useRef<{
    collapsed: Set<string>;
    collapseWidths: Map<string, number>;
    container: HTMLElement | null;
  }>({ collapsed: new Set(), collapseWidths: new Map(), container: null });
  const runCheckRef = useRef<() => void>(() => {});
  const [collapsedSegments, setCollapsedSegments] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState(false);

  const runCheck = () => {
    const el = wrapperRef.current;
    if (!el) return;

    const state = segRef.current;
    const { collapsed, collapseWidths } = state;

    // Unique segments sorted by priority desc (highest collapses first)
    const segMap = new Map<string, number>();
    for (const item of items) {
      if (!isDivider(item) && item.segment !== undefined && !segMap.has(item.segment)) {
        segMap.set(item.segment, item.priority ?? 0);
      }
    }
    const segments = [...segMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
    const segSet = new Set(segments);

    let changed = false;

    // Clean up segments that no longer exist (e.g. project changed)
    for (const seg of [...collapsed]) {
      if (!segSet.has(seg)) {
        collapsed.delete(seg);
        collapseWidths.delete(seg);
        changed = true;
      }
    }

    const overflowing = findOverflowingAncestor(el.parentElement);

    if (overflowing) {
      // Overflowing → collapse the highest-priority still-visible segment.
      // Never restore in the same pass; that would churn.
      const target = segments.find((s) => !collapsed.has(s));
      if (target) {
        state.container = overflowing;
        collapseWidths.set(target, overflowing.scrollWidth);
        collapsed.add(target);
        changed = true;
      }
    } else if (collapsed.size > 0) {
      // Fits now → restore any collapsed segment whose locked container has
      // grown past the natural width recorded at collapse time. Measure the
      // SAME element we locked onto (it no longer overflows, so it can't be
      // re-derived from scratch).
      const container = state.container;
      if (container) {
        for (const seg of [...collapsed]) {
          const cw = collapseWidths.get(seg);
          if (cw !== undefined && container.clientWidth > cw + TOL + 2) {
            collapsed.delete(seg);
            collapseWidths.delete(seg);
            changed = true;
          }
        }
      }
      if (collapsed.size === 0) state.container = null;
    }

    if (changed) setCollapsedSegments(new Set(collapsed));
  };
  runCheckRef.current = runCheck;

  useEffect(() => { runCheck(); });
  useReflowListener(wrapperRef, runCheckRef);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // Filter out collapsed segments, then strip orphan dividers
  const filtered = items.filter((item) => {
    if (isDivider(item)) return true;
    const a = item as ActionBarAction;
    return a.segment === undefined || !collapsedSegments.has(a.segment);
  });
  const visibleItems = filtered.filter((item, i) => {
    if (!isDivider(item)) return true;
    const hasBefore = filtered.slice(0, i).some((x) => !isDivider(x));
    const hasAfter = filtered.slice(i + 1).some((x) => !isDivider(x));
    return hasBefore && hasAfter;
  });

  const overflowItems = items.filter(
    (item) =>
      !isDivider(item) &&
      (item as ActionBarAction).segment !== undefined &&
      collapsedSegments.has((item as ActionBarAction).segment!),
  );

  return (
    <div ref={wrapperRef} className="shrink-0 flex items-center gap-2">
      {visibleItems.map((item) => {
        if (isDivider(item)) {
          return <div key={item.key} className="w-px h-4 bg-line shrink-0" />;
        }
        const a = item as ActionBarAction;
        return <Fragment key={a.key}>{a.element}</Fragment>;
      })}

      {overflowItems.length > 0 && (
        <div ref={dropRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "inline-flex items-center justify-center w-8 h-8 rounded-[8px] border border-transparent text-txt-2 transition-[background,border-color,color] duration-[120ms] hover:bg-bg-2 hover:border-line hover:text-txt",
              open && "bg-bg-2 border-line text-txt",
            )}
            title="More actions"
          >
            <Icon name="more-horizontal" size={16} />
          </button>

          {open && (
            <div className="absolute top-[calc(100%+6px)] right-0 min-w-[200px] surface-sheen rounded-[14px] shadow-[var(--lift)] z-50 py-1 overflow-hidden">
              {overflowItems.map((item) => {
                const a = item as ActionBarAction;
                return (
                  <div key={a.key} className="px-1.5 py-0.5 flex">
                    {a.element}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
