"use client";

import { SignInModal } from "./sign-in-modal";
import { useSignInModalStore } from "@/lib/sign-in-modal-store";

/**
 * Single root-level mount for the Sign-in modal. Kept out of the chat subtree
 * so replacing the chat (single-active-modal) doesn't unmount it. Driven by
 * {@link useSignInModalStore}.
 */
export function RootSignInModal() {
  const req = useSignInModalStore((s) => s.req);
  const close = useSignInModalStore((s) => s.close);

  return (
    <SignInModal
      open={!!req}
      accountId={req?.accountId ?? "default"}
      onClose={close}
      onSuccess={() => req?.onSuccess?.()}
    />
  );
}
