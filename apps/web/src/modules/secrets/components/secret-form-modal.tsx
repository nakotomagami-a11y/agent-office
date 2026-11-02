"use client";

import { useEffect, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Button, ACCENT_BTN_FADED_DISABLED } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { ReservedNameNote } from "@/modules/providers/components/reserved-name-note";
import {
  useCreateSecret,
  useUpdateSecret,
  type SecretWithStatus,
} from "../hooks/use-secrets";
import { FIELD_LABEL, SOFT_AREA, SOFT_FIELD, SecretHealthPanel } from "./secret-health-panel";
import { expiryMs, type Expiry } from "./secret-expiry";

interface SecretFormModalProps {
  open: boolean;
  onClose: () => void;
  /** When set, the modal edits this secret; otherwise it creates a new one. */
  secret?: SecretWithStatus | null;
  /** Fired with the new secret's id after a successful create. */
  onCreated?: (secretId: string) => void;
}

function toDateInput(ms: number | null | undefined): string {
  if (!ms) return "";
  return new Date(ms).toISOString().slice(0, 10);
}

export function SecretFormModal({ open, onClose, secret, onCreated }: SecretFormModalProps) {
  const editing = !!secret;
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [expiry, setExpiry] = useState<Expiry>("never");
  const [expiresAt, setExpiresAt] = useState("");
  const [testCmd, setTestCmd] = useState("");
  const [verifyBeforeRun, setVerifyBeforeRun] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(secret?.name ?? "");
    setLabel(secret?.label ?? "");
    setValue("");
    setShowValue(false);
    setExpiry(secret?.expiresAt ? "date" : "never");
    setExpiresAt(toDateInput(secret?.expiresAt));
    setTestCmd(secret?.testCmd ?? "");
    setVerifyBeforeRun(secret?.verifyBeforeRun ?? false);
  }, [open, secret]);

  const createMut = useCreateSecret();
  const updateMut = useUpdateSecret();
  const mut = editing ? updateMut : createMut;

  const canSave = name.trim() !== "" && (editing || value.trim() !== "") && !(expiry === "date" && !expiresAt);

  const handleSave = async () => {
    if (!canSave) return;
    const expires = expiryMs(expiry, expiresAt);
    const body = {
      name: name.trim(),
      label: label.trim(),
      value: value.trim() || undefined,
      expiresAt: expires,
      testCmd: testCmd.trim() || null,
      verifyBeforeRun,
    };
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: secret!.id, ...body });
      } else {
        const created = await createMut.mutateAsync({ ...body, value: value.trim() });
        onCreated?.(created.id);
      }
      onClose();
    } catch {
      // surfaced below via mut.error
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={editing ? "Edit secret" : "Add secret"}
      maxWidth={480}
      footer={
        <>
          <Button variant="ghost" className="min-w-[72px] justify-center" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            className={cn("min-w-[88px] px-[14px] justify-center font-semibold text-white shadow-none hover:shadow-none", ACCENT_BTN_FADED_DISABLED)}
            disabled={!canSave || mut.isPending}
            onClick={handleSave}
          >
            {mut.isPending ? "Saving…" : editing ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <div className="-mt-1 flex flex-col gap-[14px]">
        <div className="flex flex-col gap-[6px]">
          <div className="flex gap-[10px]">
            <label className="flex-[1.2] min-w-0 flex flex-col gap-[6px]">
              <span className={FIELD_LABEL}>Env var</span>
              <span className="relative flex items-center">
                <span className="absolute left-[14px] font-mono text-[13px] text-acc pointer-events-none">$</span>
                <TextInput
                  variant="soft"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
                  placeholder="VERCEL_TOKEN"
                  spellCheck={false}
                  className="pl-[28px] font-mono font-semibold"
                />
              </span>
            </label>
            <label className="flex-1 min-w-0 flex flex-col gap-[6px]">
              <span className={FIELD_LABEL}>
                Label <span className="font-normal text-txt-4">optional</span>
              </span>
              <TextInput variant="soft" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Vercel — production" />
            </label>
          </div>
          <ReservedNameNote name={name} />
        </div>

        <label className="flex flex-col gap-[6px]">
          <span className={FIELD_LABEL}>Value</span>
          <span className={cn(SOFT_FIELD, "pr-[48px] bg-card-2 rounded-[12px]")}>
            <Textarea
              wrap="off"
              rows={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={editing ? "••••••••  (unchanged)" : "Paste token"}
              spellCheck={false}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              className={cn(SOFT_AREA, "min-h-[44px] pr-0 [font:400_13px/1.5_var(--font-mono)]", !showValue && "[-webkit-text-security:disc]")}
            />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setShowValue((v) => !v);
              }}
              title={showValue ? "Hide" : "Show"}
              aria-label={showValue ? "Hide value" : "Show value"}
              aria-pressed={showValue}
              className="absolute right-[6px] top-[6px] w-8 h-8 inline-flex items-center justify-center rounded-[9px] border-0 bg-transparent text-txt-3 cursor-pointer transition-colors hover:bg-card-3 hover:text-txt"
            >
              <Icon name="eye" size={14} className="w-[14px] h-[14px] [flex:0_0_14px]" />
            </button>
          </span>
          <span className="flex items-center gap-[6px] px-[2px] text-[11.5px] text-txt-4">
            {editing ? (
              "Leave blank to keep the current value"
            ) : (
              <>
                <Icon name="shield" size={12} className="w-[12px] h-[12px] [flex:0_0_12px]" />
                Stored on this device only
              </>
            )}
          </span>
        </label>

        <SecretHealthPanel
          secret={secret}
          name={name}
          expiry={expiry}
          onExpiry={setExpiry}
          expiresAt={expiresAt}
          onExpiresAt={setExpiresAt}
          testCmd={testCmd}
          onTestCmd={setTestCmd}
          verify={verifyBeforeRun}
          onVerify={setVerifyBeforeRun}
          value={value}
        />

        {mut.error ? (
          <p className="m-0 text-[12px] text-[var(--error)]">{(mut.error as Error).message}</p>
        ) : null}
      </div>
    </ModalShell>
  );
}

