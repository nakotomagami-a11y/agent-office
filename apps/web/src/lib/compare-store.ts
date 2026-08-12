import { create } from "zustand";

type CompareState = {
  open: boolean;
  baseRunId: string | null;
  openWith: (runId: string) => void;
  close: () => void;
};

export const useCompareStore = create<CompareState>((set) => ({
  open: false,
  baseRunId: null,
  openWith: (runId) => set({ open: true, baseRunId: runId }),
  close: () => set({ open: false, baseRunId: null }),
}));
