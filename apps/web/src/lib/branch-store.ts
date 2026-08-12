import { create } from "zustand";

type BranchState = {
  agentId: string | null;
  instanceId: string | null;
  prompt: string | null;
  setSeed: (opts: { agentId: string; instanceId?: string | null; prompt: string }) => void;
  /** Returns the pending seed and clears it, but only if both agentId and instanceId match. */
  consumeSeed: (agentId: string, instanceId?: string | null) => { prompt: string } | null;
};

export const useBranchStore = create<BranchState>((set, get) => ({
  agentId: null,
  instanceId: null,
  prompt: null,
  setSeed: ({ agentId, instanceId = null, prompt }) =>
    set({ agentId, instanceId, prompt }),
  consumeSeed: (agentId, instanceId = null) => {
    const s = get();
    const slotA = instanceId && instanceId.length > 0 ? instanceId : null;
    const slotB = s.instanceId && s.instanceId.length > 0 ? s.instanceId : null;
    if (!s.prompt || s.agentId !== agentId || slotA !== slotB) return null;
    set({ agentId: null, instanceId: null, prompt: null });
    return { prompt: s.prompt };
  },
}));
