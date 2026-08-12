import { create } from "zustand";

type FlutterState = {
  open: boolean;
  setOpen: (v: boolean) => void;
  activeDeviceId: string | null;
  setActiveDeviceId: (id: string | null) => void;
};

export const useFlutterStore = create<FlutterState>((set) => ({
  open: false,
  setOpen: (v) => set({ open: v }),
  activeDeviceId: null,
  setActiveDeviceId: (id) => set({ activeDeviceId: id }),
}));
