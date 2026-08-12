"use client";

import { create } from "zustand";

// The Sign-in modal is opened from inside the agent chat (an auth-error card).
// Because opening a modal now replaces whatever was open — which would unmount
// the chat and its nested card — Sign-in is hoisted to a single root mount
// driven by this store, so it survives the chat closing behind it.

interface SignInRequest {
  accountId: string;
  /** Runs after credentials land (e.g. reopen the chat / retry). */
  onSuccess?: () => void;
}

interface SignInModalState {
  req: SignInRequest | null;
  open: (req: SignInRequest) => void;
  close: () => void;
}

export const useSignInModalStore = create<SignInModalState>((set) => ({
  req: null,
  open: (req) => set({ req }),
  close: () => set({ req: null }),
}));
