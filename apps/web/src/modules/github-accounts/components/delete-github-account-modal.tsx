"use client";

import { useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Tag } from "@/components/ui/tag";
import { useUpdateProject } from "@/modules/projects/hooks/use-projects";
import { ApiError, useDeleteGithubAccount, type GithubAccount } from "../hooks/use-github-accounts";

interface DeleteGithubAccountModalProps {
  account: GithubAccount | null;
  onClose: () => void;
}

export function DeleteGithubAccountModal({ account, onClose }: DeleteGithubAccountModalProps) {
  const [blockedBy, setBlockedBy] = useState<string[] | null>(null);
  const [reassign, setReassign] = useState(false);
  const [otherError, setOtherError] = useState<string | null>(null);
  const del = useDeleteGithubAccount();
  const update = useUpdateProject();
  const busy = del.isPending || update.isPending;

  const handleConfirm = async () => {
    if (!account) return;
    setOtherError(null);
    try {
      await del.mutateAsync(account.id);
      handleClose();
    } catch (e) {
      const ids: unknown = e instanceof ApiError && e.status === 409 ? e.data?.blockedBy : undefined;
      if (Array.isArray(ids) && ids.every((x): x is string => typeof x === "string")) {
        setBlockedBy(ids);
        setReassign(false);
      } else {
        setOtherError(e instanceof Error ? e.message : String(e));
      }
    }
  };

  const handleReassignAndDelete = async () => {
    if (!blockedBy) return;
    setOtherError(null);
    let switched = 0;
    try {
      for (const id of blockedBy) {
        await update.mutateAsync({ id, patch: { meta: { githubAccountId: null } } });
        switched++;
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      setOtherError(`Switched ${switched} of ${blockedBy.length} projects, then failed: ${reason}. Nothing was deleted.`);
      return;
    }
    await handleConfirm();
  };

  const handleClose = () => {
    setBlockedBy(null);
    setReassign(false);
    setOtherError(null);
    onClose();
  };

  const cancel = (
    <Button variant="ghost" className="min-w-[72px] justify-center" onClick={handleClose} disabled={busy}>
      Cancel
    </Button>
  );
  const destructive = "min-w-[88px] px-[14px] justify-center gap-[6px] font-semibold border-0 shadow-none";

  return (
    <ModalShell
      open={!!account}
      onClose={busy ? () => undefined : handleClose}
      title={blockedBy ? "Reassign projects first" : "Delete GitHub account"}
      size="sm"
      footer={
        !blockedBy ? (
          <>
            {cancel}
            <Button variant="danger" className={destructive} onClick={handleConfirm} disabled={busy}>
              <Icon name="trash" size={13} className="w-[13px] h-[13px] [flex:0_0_13px]" />
              {del.isPending ? "Deleting…" : "Delete"}
            </Button>
          </>
        ) : reassign ? (
          <>
            {cancel}
            <Button variant="danger" className={destructive} onClick={handleReassignAndDelete} disabled={busy}>
              <Icon name="trash" size={13} className="w-[13px] h-[13px] [flex:0_0_13px]" />
              {del.isPending ? "Deleting…" : update.isPending ? "Switching…" : "Switch & delete"}
            </Button>
          </>
        ) : (
          <Button variant="primary" className="min-w-[88px] px-[14px] justify-center font-semibold text-white" onClick={handleClose}>
            OK
          </Button>
        )
      }
    >
      {!account ? null : blockedBy ? (
        <div className="flex flex-col gap-[14px]">
          <div className="flex gap-[14px] items-start">
            <div className="w-[52px] h-[52px] shrink-0 flex items-center justify-center text-amber">
              <Icon name="alert-circle" size={42} className="w-[42px] h-[42px] [flex:0_0_42px]" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-[10px]">
              <p className="m-0 text-[13px] text-txt-2 leading-[1.9]">
                <Tag variant="name">{account.label}</Tag> is still used by these projects. Reassign them first, then try again.
              </p>
              <div className="flex flex-wrap gap-[6px]">
                {blockedBy.map((id) => (
                  <Tag key={id} variant="project">{id}</Tag>
                ))}
              </div>
            </div>
          </div>
          <Checkbox
            checked={reassign}
            onChange={(e) => setReassign(e.target.checked)}
            disabled={busy}
            className="flex gap-[12px] px-[14px] py-[12px] rounded-[12px] bg-[color-mix(in_srgb,var(--txt)_3%,transparent)]"
            label={
              <span className="flex flex-col gap-[2px]">
                <span className="text-[12.5px] text-txt">
                  Switch these projects to the default account
                </span>
                <span className="text-[11.5px] text-txt-4">Then delete {account.label}</span>
              </span>
            }
          />
          {otherError ? <div className="text-[12px] text-status-error">{otherError}</div> : null}
        </div>
      ) : (
        <div className="flex gap-[14px] items-start">
          <div className="w-[52px] h-[52px] shrink-0 flex items-center justify-center text-status-error">
            <Icon name="trash" size={42} className="w-[42px] h-[42px] [flex:0_0_42px]" />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-[10px]">
            <p className="m-0 text-[13px] text-txt-2 leading-[1.9]">
              Delete <Tag variant="name">{account.label}</Tag> from <Tag variant="project">agent-office</Tag>?
              Your GitHub account itself is not touched.
            </p>
            {otherError ? <div className="text-[12px] text-status-error">{otherError}</div> : null}
          </div>
        </div>
      )}
    </ModalShell>
  );
}
