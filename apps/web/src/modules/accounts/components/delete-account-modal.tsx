"use client";

import { useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";
import { ApiError, useDeleteAccount, type Account } from "../hooks/use-accounts";

interface DeleteAccountModalProps {
  account: Account | null;
  onClose: () => void;
}

export function DeleteAccountModal({ account, onClose }: DeleteAccountModalProps) {
  const [blockedBy, setBlockedBy] = useState<string[] | null>(null);
  const [otherError, setOtherError] = useState<string | null>(null);
  const del = useDeleteAccount();

  const handleConfirm = async () => {
    if (!account) return;
    setBlockedBy(null);
    setOtherError(null);
    try {
      await del.mutateAsync(account.id);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && Array.isArray(e.data?.blockedBy)) {
        setBlockedBy(e.data!.blockedBy as string[]);
      } else {
        setOtherError(e instanceof Error ? e.message : String(e));
      }
    }
  };

  const handleClose = () => {
    setBlockedBy(null);
    setOtherError(null);
    onClose();
  };

  return (
    <ModalShell
      open={!!account}
      onClose={handleClose}
      title={blockedBy ? "Reassign projects first" : "Delete account"}
      size="sm"
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={handleClose}>
            {blockedBy ? "OK" : "Cancel"}
          </Button>
          {!blockedBy && (
            <Button
              size="sm"
              variant="primary"
              className="!bg-[var(--error)] !text-white"
              onClick={handleConfirm}
              disabled={del.isPending}
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </Button>
          )}
        </>
      }
    >
      {!account ? null : blockedBy ? (
        <div className="flex flex-col gap-[10px]">
          <p className="m-0 text-[13px] text-txt-2 leading-[1.55]">
            <strong>{account.label}</strong> is still used by{" "}
            {blockedBy.length === 1 ? "1 project" : `${blockedBy.length} projects`}.
            Reassign them to a different account first, then try again.
          </p>
          <ul className="m-0 pl-4 flex flex-col gap-[3px] text-[12.5px] text-txt-3 font-mono">
            {blockedBy.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-[10px]">
          <p className="m-0 text-[13px] text-txt-2 leading-[1.55]">
            Delete the <strong>{account.label}</strong> account? This removes
            it from agent-office and deletes its config dir. The upstream
            Claude account is not touched.
          </p>
          {otherError ? (
            <div className="text-[12px] text-[var(--error)]">{otherError}</div>
          ) : null}
        </div>
      )}
    </ModalShell>
  );
}
