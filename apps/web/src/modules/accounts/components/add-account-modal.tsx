"use client";

import { useEffect, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { Icon } from "@/components/ui/icon";
import {
  useAccountStatus,
  useCreateAccount,
  useRenameAccount,
  type Account,
} from "../hooks/use-accounts";
import { PlanBadge } from "./plan-badge";
import { SignInPanel } from "./sign-in-panel";

type Step = "name" | "waiting" | "confirm";

interface AddAccountModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddAccountModal({ open, onClose }: AddAccountModalProps) {
  const [step, setStep] = useState<Step>("name");
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<Account | null>(null);

  // Reset every time the modal reopens.
  useEffect(() => {
    if (!open) {
      setStep("name");
      setLabel("");
      setCreated(null);
    }
  }, [open]);

  const createMut = useCreateAccount();
  const renameMut = useRenameAccount();
  const statusQ = useAccountStatus(created?.id ?? null, step === "waiting");

  // Advance from waiting → confirm the moment credentials land.
  useEffect(() => {
    if (step === "waiting" && statusQ.data?.ready) {
      setStep("confirm");
    }
  }, [step, statusQ.data?.ready]);

  const handleCreate = async () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    try {
      const account = await createMut.mutateAsync(trimmed);
      setCreated(account);
      setStep("waiting");
    } catch {
      // Error surfaces via createMut.error rendering.
    }
  };

  const handleFinishRename = async () => {
    if (!created) return;
    const trimmed = label.trim();
    if (trimmed && trimmed !== created.label) {
      try {
        await renameMut.mutateAsync({ id: created.id, label: trimmed });
      } catch {
        // Non-fatal — the account is already created.
      }
    }
    onClose();
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={
        step === "name"
          ? "Add Claude account"
          : step === "waiting"
            ? "Log in to Claude"
            : "Account ready"
      }
      size="md"
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {step === "confirm" ? "Cancel" : "Cancel"}
          </Button>
          {step === "name" && (
            <Button
              size="sm"
              variant="primary"
              onClick={handleCreate}
              disabled={createMut.isPending || !label.trim()}
            >
              {createMut.isPending ? "Creating…" : "Next"}
            </Button>
          )}
          {step === "confirm" && (
            <Button
              size="sm"
              variant="primary"
              onClick={handleFinishRename}
              disabled={renameMut.isPending}
            >
              {renameMut.isPending ? "Saving…" : "Finish"}
            </Button>
          )}
        </>
      }
    >
      {step === "name" && (
        <div className="flex flex-col gap-[10px]">
          <p className="m-0 text-[13px] text-txt-2 leading-[1.55]">
            Pick a name for this account. You&apos;ll use it to route specific
            projects to this Claude subscription (for example,
            &ldquo;customer-acme&rdquo; for a client-sponsored project).
          </p>
          <TextInput
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. customer-acme"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleCreate();
              }
            }}
          />
          {createMut.error ? (
            <div className="text-[12px] text-[var(--error)]">
              {createMut.error instanceof Error
                ? createMut.error.message
                : String(createMut.error)}
            </div>
          ) : null}
        </div>
      )}

      {step === "waiting" && created && (
        <SignInPanel accountId={created.id} onSuccess={() => setStep("confirm")} />
      )}

      {step === "confirm" && created && statusQ.data && (
        <div className="flex flex-col gap-[12px]">
          <div className="flex items-center gap-[10px]">
            <Icon name="check" size={16} className="text-status-done" />
            <span className="text-[13px] text-txt">
              Login detected — this account is ready.
            </span>
          </div>
          <div className="flex items-center gap-[8px]">
            <PlanBadge plan={statusQ.data.plan} />
            {statusQ.data.email ? (
              <span className="font-mono text-[12px] text-txt-3">
                {statusQ.data.email}
              </span>
            ) : null}
          </div>
          <label className="flex flex-col gap-[6px]">
            <span className="text-[12px] text-txt-3 font-mono uppercase tracking-[0.06em]">
              Label
            </span>
            <TextInput
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Rename this account (optional)"
            />
          </label>
        </div>
      )}
    </ModalShell>
  );
}
