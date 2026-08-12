"use client";

import { create } from "zustand";

export type AgentCapState =
  | { kind: "closed" }
  | { kind: "soft"; onConfirm: () => void; onCancel: () => void }
  | { kind: "hard"; onDismiss: () => void };

type Store = {
  state: AgentCapState;
  showSoft: (onConfirm: () => void, onCancel: () => void) => void;
  showHard: (onDismiss: () => void) => void;
  close: () => void;
};

/**
 * Small store used by `useSpawnInstance` to raise a modal when a
 * roster-cap error comes back from the server. The modal is mounted
 * once at the app-layout level so any spawn call site can trigger it.
 */
export const useAgentCapStore = create<Store>((set) => ({
  state: { kind: "closed" },
  showSoft: (onConfirm, onCancel) => set({ state: { kind: "soft", onConfirm, onCancel } }),
  showHard: (onDismiss) => set({ state: { kind: "hard", onDismiss } }),
  close: () => set({ state: { kind: "closed" } }),
}));
