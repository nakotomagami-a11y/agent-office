"use client";

import { useEffect, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Button, ACCENT_BTN_FADED_DISABLED } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { SignInStep } from "@/modules/accounts/components/sign-in-panel";
import {
  useGithubAccountStatus,
  useCreateGithubAccount,
  useRenameGithubAccount,
  type GithubAccount,
} from "../hooks/use-github-accounts";

type Step = "name" | "waiting" | "confirm";

interface AddGithubAccountModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddGithubAccountModal({ open, onClose }: AddGithubAccountModalProps) {
  const [step, setStep] = useState<Step>("name");
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<GithubAccount | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Reset every time the modal reopens.
  useEffect(() => {
    if (!open) {
      setStep("name");
      setLabel("");
      setCreated(null);
      setCopied(null);
    }
  }, [open]);

  const createMut = useCreateGithubAccount();
  const renameMut = useRenameGithubAccount();
  const statusQ = useGithubAccountStatus(created?.id ?? null, step === "waiting");

  // Advance from waiting → confirm the moment gh reports an authed user.
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

  const loginCommand = created ? `GH_CONFIG_DIR=${created.configDir} gh auth login` : "";
  const setupGitCommand = created ? `GH_CONFIG_DIR=${created.configDir} gh auth setup-git` : "";

  const handleCopy = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(command);
      setTimeout(() => setCopied((c) => (c === command ? null : c)), 1500);
    } catch {
      // Non-secure contexts / permission-denied — user can still select+copy.
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

  const commandRow = (command: string) => (
    <div className="flex items-center gap-[4px] py-[6px] pr-[6px] pl-[14px] rounded-[12px] bg-card-2">
      <code className="flex-1 min-w-0 font-mono text-[11.5px] text-txt-2 whitespace-nowrap overflow-hidden text-ellipsis" title={command}>
        {command}
      </code>
      <button
        type="button"
        onClick={() => void handleCopy(command)}
        title={copied === command ? "Copied" : "Copy"}
        aria-label={copied === command ? "Copied" : "Copy"}
        className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-[9px] border-0 bg-transparent text-txt-3 cursor-pointer transition-colors hover:bg-card-3 hover:text-txt"
      >
        <Icon name={copied === command ? "check" : "copy"} size={14} className="w-[14px] h-[14px] [flex:0_0_14px]" />
      </button>
    </div>
  );

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={
        step === "name"
          ? "Add GitHub account"
          : step === "waiting"
            ? "Log in with gh"
            : "Account ready"
      }
      maxWidth={step === "waiting" ? 480 : 420}
      footer={
        <>
          {step === "waiting" && (
            <span className="mr-auto flex items-center gap-[8px] text-[12px] text-txt-3">
              <span className="w-[10px] h-[10px] rounded-full border-2 border-acc border-t-transparent animate-[spin_0.9s_linear_infinite]" />
              Waiting for gh login…
            </span>
          )}
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
              e.g. work · used to route a project&apos;s git pushes through this identity
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
        <div className="flex flex-col gap-[18px] -mt-[2px] mb-[2px]">
          <SignInStep n={1} title="Run in a terminal" gap={8}>{commandRow(loginCommand)}</SignInStep>
          <SignInStep n={2} title="Once, for git pushes" gap={8}>{commandRow(setupGitCommand)}</SignInStep>
          {statusQ.error ? (
            <div className="text-[12px] text-txt-4">
              {statusQ.error instanceof Error
                ? statusQ.error.message
                : String(statusQ.error)}
            </div>
          ) : null}
        </div>
      )}

      {step === "confirm" && created && statusQ.data && (
        <div className="-mt-1 flex flex-col gap-[14px]">
          <div className="flex items-center gap-[12px] px-[14px] py-[12px] rounded-[12px] bg-green-soft">
            <Icon name="check" size={22} className="w-[22px] h-[22px] [flex:0_0_22px] text-green shrink-0" />
            <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
              <span className="text-[13px] font-semibold">Signed in</span>
              {statusQ.data.username ? (
                <span className="font-mono text-[11.5px] text-txt-3 truncate">@{statusQ.data.username}</span>
              ) : null}
            </div>
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
