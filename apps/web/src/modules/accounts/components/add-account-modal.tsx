"use client";

import { useEffect, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Button, ACCENT_BTN_FADED_DISABLED } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import {
  useAccountStatus,
  useCreateAccount,
  useRenameAccount,
  type Account,
} from "../hooks/use-accounts";
import { PlanBadge } from "./plan-badge";
import { SignInPanel, SignInStatus } from "./sign-in-panel";

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

  const cta = cn("min-w-[88px] px-[14px] justify-center gap-[6px] font-semibold text-white shadow-none hover:shadow-none", ACCENT_BTN_FADED_DISABLED);
  const field = "h-[46px] px-4 text-[15px] font-semibold";

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
      maxWidth={step === "waiting" ? 440 : 420}
      footer={
        <>
          {step === "waiting" && created && <SignInStatus accountId={created.id} />}
          <Button variant="ghost" className="min-w-[72px] justify-center" onClick={onClose}>
            Cancel
          </Button>
          {step === "name" && (
            <Button
              variant="primary"
              className={cta}
              onClick={handleCreate}
              disabled={createMut.isPending || !label.trim()}
            >
              {createMut.isPending ? "Creating…" : "Next"}
              <Icon name="chevron" size={12} className="w-[12px] h-[12px] [flex:0_0_12px]" />
            </Button>
          )}
          {step === "confirm" && (
            <Button
              variant="primary"
              className={cta}
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
        <div className="-mt-1 flex gap-[14px] items-start">
          <div className="w-[52px] h-[52px] shrink-0 flex items-center justify-center text-acc">
            <Icon name="identity" size={42} className="w-[42px] h-[42px] [flex:0_0_42px]" />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-[8px]">
            <TextInput
              variant="soft"
              className={field}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Account name"
              aria-label="Account name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
            />
            <span className="px-1 text-[11.5px] text-txt-4">
              e.g. customer-acme · used to route projects to this subscription
            </span>
            {createMut.error ? (
              <div className="px-1 text-[12px] text-[var(--error)]">
                {createMut.error instanceof Error
                  ? createMut.error.message
                  : String(createMut.error)}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {step === "waiting" && created && (
        <SignInPanel showStatus={false} accountId={created.id} onSuccess={() => setStep("confirm")} />
      )}

      {step === "confirm" && created && statusQ.data && (
        <div className="-mt-1 flex flex-col gap-[14px]">
          <div className="flex items-center gap-[12px] px-[14px] py-[12px] rounded-[12px] bg-green-soft">
            <Icon name="check" size={22} className="w-[22px] h-[22px] [flex:0_0_22px] text-green shrink-0" />
            <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
              <span className="text-[13px] font-semibold">Signed in</span>
              {statusQ.data.email ? (
                <span className="font-mono text-[11.5px] text-txt-3 truncate">{statusQ.data.email}</span>
              ) : null}
            </div>
            <PlanBadge plan={statusQ.data.plan} solid />
          </div>
          <TextInput
            variant="soft"
            className={field}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Account name"
            aria-label="Account name"
          />
        </div>
      )}
    </ModalShell>
  );
}
