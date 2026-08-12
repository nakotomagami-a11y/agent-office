"use client";

import { useEffect, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { Icon } from "@/components/ui/icon";
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
  const [copied, setCopied] = useState(false);

  // Reset every time the modal reopens.
  useEffect(() => {
    if (!open) {
      setStep("name");
      setLabel("");
      setCreated(null);
      setCopied(false);
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

  const handleCopy = async () => {
    if (!loginCommand) return;
    try {
      await navigator.clipboard.writeText(loginCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
      size="md"
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
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
            Pick a name for this GitHub account. You&apos;ll use it to route a
            project&apos;s git pushes through the right identity (for example,
            &ldquo;work&rdquo; or &ldquo;personal&rdquo;).
          </p>
          <TextInput
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. work"
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
        <div className="flex flex-col gap-[12px]">
          <p className="m-0 text-[13px] text-txt-2 leading-[1.55]">
            Open a terminal and run the command below, then complete the browser
            login flow. This modal will advance automatically once{" "}
            <code className="font-mono text-[11.5px] text-txt-2">gh</code> reports
            an authenticated user for this config dir.
          </p>
          <div className="flex items-stretch gap-[6px]">
            <code className="flex-1 min-w-0 px-[10px] py-[8px] rounded-[8px] border border-line bg-bg-2 font-mono text-[11.5px] text-txt overflow-x-auto whitespace-nowrap">
              {loginCommand}
            </code>
            <Button size="sm" variant="ghost" onClick={handleCopy}>
              <Icon name={copied ? "check" : "copy"} size={14} />
              <span className="ml-[6px]">{copied ? "Copied" : "Copy"}</span>
            </Button>
          </div>
          <p className="m-0 text-[12px] text-txt-3 leading-[1.55]">
            One-time, so git-over-HTTPS pushes use gh&apos;s credential helper for
            this account, also run:
          </p>
          <code className="px-[10px] py-[8px] rounded-[8px] border border-line bg-bg-2 font-mono text-[11.5px] text-txt overflow-x-auto whitespace-nowrap">
            {setupGitCommand}
          </code>
          <div className="flex items-center gap-[8px] text-[12px] text-txt-3">
            <div className="w-[10px] h-[10px] rounded-full border-2 border-acc border-t-transparent animate-spin" />
            <span>
              Waiting for <code className="font-mono text-[11.5px] text-txt-2">gh</code> login…
            </span>
          </div>
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
        <div className="flex flex-col gap-[12px]">
          <div className="flex items-center gap-[10px]">
            <Icon name="check" size={16} className="text-status-done" />
            <span className="text-[13px] text-txt">
              Login detected — this account is ready.
            </span>
          </div>
          {statusQ.data.username ? (
            <div className="flex items-center gap-[8px]">
              <span className="font-mono text-[12px] text-txt-3">@{statusQ.data.username}</span>
            </div>
          ) : null}
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
