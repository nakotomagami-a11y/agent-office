"use client";

import { useEffect, useId, useRef } from "react";
import { create } from "zustand";

// Global "which modal is open" authority. Only ONE modal is ever active — when
// a modal opens, whichever was open before is closed (replace semantics, no
// stacking). Every modal participates by registering itself while open; the
// shared <ModalShell> does this automatically, so most modals need no changes.
//
// This deliberately does NOT own each modal's JSX or props (many carry
// callbacks / local data that don't belong in a global store). It owns exactly
// one thing: the id of the currently-open modal, and the means to close it.

type Closer = () => void;

interface ModalManagerState {
  activeId: string | null;
  /** id → its close() fn. Not reactive; read imperatively. */
  registry: Map<string, Closer>;
  register: (id: string, close: Closer) => void;
  unregister: (id: string) => void;
}

export const useModalManager = create<ModalManagerState>((set, get) => ({
  activeId: null,
  registry: new Map(),
  register: (id, close) => {
    const { activeId, registry } = get();
    registry.set(id, close);
    if (activeId && activeId !== id) {
      const prevClose = registry.get(activeId);
      registry.delete(activeId);
      // Close the previously-active modal so only this one remains visible.
      prevClose?.();
    }
    set({ activeId: id });
  },
  unregister: (id) => {
    const { activeId, registry } = get();
    registry.delete(id);
    if (activeId === id) set({ activeId: null });
  },
}));

/**
 * Register a modal with the global manager for as long as it's open. When this
 * modal opens it becomes the sole active modal, closing any other. Call it
 * unconditionally (hook rules) — it self-gates on `open`.
 */
export function useRegisterModal(open: boolean, onClose: () => void): void {
  const id = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const { register, unregister } = useModalManager.getState();
    register(id, () => onCloseRef.current());
    return () => unregister(id);
  }, [open, id]);
}
