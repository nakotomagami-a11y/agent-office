import { create } from "zustand";

/**
 * Dev instrument: whether the live FPS readout is shown. Toggled from the dev
 * menu; read by the dev-menu pinned meter and the iso office's two in-canvas
 * FPS readouts (canvas-tools bar + build-mode badge). Ephemeral — resets on
 * reload, matching the other dev instruments.
 */
type FpsMeterState = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

export const useFpsMeterStore = create<FpsMeterState>((set) => ({
  enabled: false,
  setEnabled: (enabled) => set({ enabled }),
}));
