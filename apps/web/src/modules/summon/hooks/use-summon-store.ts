"use client";

import { create } from "zustand";

type SummonState = {
  open: boolean;
  agentId: string | null;
  /** Optional context for the next summon (project + instance overrides). */
  projectId?: string;
  instanceId?: string;
  openChat: (agentId: string, opts?: { projectId?: string; instanceId?: string }) => void;
  closeChat: () => void;
};

export const useSummonStore = create<SummonState>((set) => ({
  open: false,
  agentId: null,
  openChat: (agentId, opts) =>
    set({ open: true, agentId, projectId: opts?.projectId, instanceId: opts?.instanceId }),
  closeChat: () => set({ open: false }),
}));
