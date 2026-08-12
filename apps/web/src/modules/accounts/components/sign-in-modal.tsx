"use client";

import { ModalShell } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";
import { SignInPanel } from "./sign-in-panel";
import { cancelLogin } from "../hooks/use-account-login";

interface SignInModalProps {
  open: boolean;
  accountId: string;
  /** Human label shown in the title, e.g. the account name. */
  accountLabel?: string;
  onClose: () => void;
  /** Called after a successful sign-in (before the modal closes). */
  onSuccess?: () => void;
}

/**
 * Standalone re-authentication modal. Opened from the auth-error card in a
 * chat when an agent's OAuth session expires — signs the account back in
 * without dropping to a terminal.
 */
export function SignInModal({
  open,
  accountId,
  accountLabel,
  onClose,
  onSuccess,
}: SignInModalProps) {
  const handleClose = () => {
    cancelLogin(accountId).catch(() => {});
    onClose();
  };

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      title={accountLabel ? `Sign in — ${accountLabel}` : "Sign in to Claude"}
      size="md"
      footer={
        <Button size="sm" variant="ghost" onClick={handleClose}>
          Cancel
        </Button>
      }
    >
      {open ? (
        <SignInPanel
          accountId={accountId}
          onSuccess={() => {
            onSuccess?.();
            onClose();
          }}
        />
      ) : null}
    </ModalShell>
  );
}
