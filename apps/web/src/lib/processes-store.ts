import { create } from "zustand";

type ProcessesState = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

export const useProcessesStore = create<ProcessesState>((set) => ({
  open: false,
  setOpen: (v) => set({ open: v }),
}));
