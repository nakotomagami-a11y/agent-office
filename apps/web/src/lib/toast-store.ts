import { create } from "zustand";

export type Toast = { id: number; message: string };

type ToastState = {
  toasts: Toast[];
  push: (message: string) => void;
  dismiss: (id: number) => void;
};

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message }] }));
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      3200,
    );
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Fire a transient toast from anywhere (component or callback). */
export const toast = (message: string) => useToastStore.getState().push(message);
