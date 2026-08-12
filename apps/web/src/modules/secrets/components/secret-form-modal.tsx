"use client";

import { useEffect, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useCreateSecret,
  useUpdateSecret,
  type SecretWithStatus,
} from "../hooks/use-secrets";

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
  const [expiresAt, setExpiresAt] = useState("");
  const [testCmd, setTestCmd] = useState("");
  const [verifyBeforeRun, setVerifyBeforeRun] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(secret?.name ?? "");
    setLabel(secret?.label ?? "");
    setValue("");
    setExpiresAt(toDateInput(secret?.expiresAt));
    setTestCmd(secret?.testCmd ?? "");
    setVerifyBeforeRun(secret?.verifyBeforeRun ?? false);
  }, [open, secret]);

  const createMut = useCreateSecret();
  const updateMut = useUpdateSecret();
  const mut = editing ? updateMut : createMut;

  const canSave = name.trim() !== "" && (editing || value.trim() !== "");

  const handleSave = async () => {
    if (!canSave) return;
    const expiresMs = expiresAt ? new Date(expiresAt + "T00:00:00").getTime() : null;
    const body = {
      name: name.trim(),
      label: label.trim(),
      value: value.trim() || undefined,
      expiresAt: expiresMs,
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
      footer={
        <div className="flex items-center justify-end gap-[8px]">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!canSave || mut.isPending} onClick={handleSave}>
            {mut.isPending ? "Saving…" : editing ? "Save" : "Create"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-[14px]">
        <Field label="Env var name" hint="Injected verbatim into the run, e.g. VERCEL_TOKEN">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
            placeholder="VERCEL_TOKEN"
            className="font-mono"
          />
        </Field>

        <Field label="Label" hint="Optional human name shown in lists">
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Vercel — production" />
        </Field>

        <Field label="Value" hint={editing ? "Leave blank to keep the current value" : "The token itself — stored on this device only"}>
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={editing ? "••••••••  (unchanged)" : "paste token"}
            rows={2}
            className="font-mono"
          />
        </Field>

        <Field label="Expires" hint="Optional — shows a warning badge; never blocks a run on its own">
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="h-[34px] px-[10px] rounded-[8px] bg-bg-2 border border-line text-[13px] text-txt font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-acc"
          />
        </Field>

        <Field
          label="Test command"
          hint={'Optional shell check run with this env var set; exit 0 = valid. e.g. curl -sf -H "Authorization: Bearer $VERCEL_TOKEN" https://api.vercel.com/v2/user'}
        >
          <Textarea
            value={testCmd}
            onChange={(e) => setTestCmd(e.target.value)}
            placeholder={`curl -sf -H "Authorization: Bearer $${name || "TOKEN"}" https://…`}
            rows={2}
            className="font-mono text-[12px]"
          />
        </Field>

        <Checkbox
          checked={verifyBeforeRun}
          onChange={(e) => setVerifyBeforeRun(e.target.checked)}
          disabled={!testCmd.trim()}
          label="Verify before every run — a failed live test blocks the run"
        />

        {mut.error ? (
          <p className="text-[12px] text-[var(--error)]">{(mut.error as Error).message}</p>
        ) : null}
      </div>
    </ModalShell>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-[5px]">
      <span className="text-[12px] font-medium text-txt">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-txt-3 leading-[1.4]">{hint}</span> : null}
    </label>
  );
}
