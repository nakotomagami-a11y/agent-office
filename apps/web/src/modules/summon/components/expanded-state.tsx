"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

/**
 * Shared collapsible-section state for message-bubble children.
 *
 * A stable `Map<id, open>` lives in the parent thread (via `useRef`) so
 * collapsible sections keep their expanded/collapsed state across
 * re-renders and remounts during streaming. Child components read + write
 * through this context; the parent owns the underlying map.
 */
export const ExpandedStateContext = createContext<{
  /** `undefined` means "never toggled" — lets the caller's own default win. */
  get: (id: string) => boolean | undefined;
  set: (id: string, val: boolean) => void;
} | null>(null);

/**
 * Local hook for a single collapsible section. Reads the initial value
 * from context (parent's map) and writes back on every toggle.
 *
 * `defaultOpen` is only consulted the first time this `id` is seen — once
 * the user (or a caller) has toggled it, the map in context is the source
 * of truth from then on.
 */
export function useExpandedState(id: string, defaultOpen = false): [boolean, () => void] {
  const ctx = useContext(ExpandedStateContext);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [open, setOpen] = useState(() => ctx?.get(id) ?? defaultOpen);
  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      ctxRef.current?.set(id, next);
      return next;
    });
  }, [id]);
  return [open, toggle];
}
