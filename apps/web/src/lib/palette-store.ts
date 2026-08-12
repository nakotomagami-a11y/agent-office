import { create } from "zustand";

type PaletteState = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

export const usePaletteStore = create<PaletteState>((set) => ({
  open: false,
  setOpen: (v) => set({ open: v }),
}));
