import { create } from "zustand";

export type DevRunState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "running"; pid: number; port: number | null; url: string | null }
  | { phase: "stopping" };

type DevServerState = {
  // keyed by `${projectId}:${commandKey}`
  runStates: Record<string, DevRunState>;
  // project IDs that have had their running processes reconciled
  reconciled: Set<string>;
  setRunState: (projectId: string, key: string, s: DevRunState) => void;
  getRunState: (projectId: string, key: string) => DevRunState;
  markReconciled: (projectId: string) => void;
  isReconciled: (projectId: string) => boolean;
};

export const useDevServerStore = create<DevServerState>((set, get) => ({
  runStates: {},
  reconciled: new Set(),
  setRunState: (projectId, key, s) =>
    set((prev) => ({ runStates: { ...prev.runStates, [`${projectId}:${key}`]: s } })),
  getRunState: (projectId, key) =>
    get().runStates[`${projectId}:${key}`] ?? { phase: "idle" },
  markReconciled: (projectId) =>
    set((prev) => ({ reconciled: new Set([...prev.reconciled, projectId]) })),
  isReconciled: (projectId) => get().reconciled.has(projectId),
}));
