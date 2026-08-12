"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useCreateWorkflow } from "@/modules/workflows/hooks/use-workflows";

export type MsgActionsProps = {
  text: string;
  onRerun?: (t: string) => void;
};

/**
 * Floating action pill rendered over a message on hover: copy, rerun, save
 * as workflow. Rerun and save only appear when the caller wires them
 * up (`onRerun` present ⇒ user message with rerun capability).
 */
export function MsgActions({ text, onRerun }: MsgActionsProps) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveWorkflow = useCreateWorkflow();

  const handleCopy = () => {
    copyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSave = () => {
    const body = text.trim();
    if (!body || saveWorkflow.isPending) return;
    saveWorkflow.mutate(
      { title: body.slice(0, 60), body, category: "general" },
      { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 1500); } },
    );
  };

  return (
    <div className="absolute top-[-4px] right-0 flex gap-1 p-[2px] bg-ao-bg-2 border border-ao-line-1 rounded-[8px] opacity-0 -translate-y-[2px] transition-[opacity,transform] duration-[140ms] z-[2] group-hover/msg:opacity-100 group-hover/msg:translate-y-0">
      <IconButton ariaLabel="Copy" title="Copy" onClick={handleCopy}>
        {copied ? <Icon name="check" size={13} className="text-[var(--ao-ok)]" /> : <Icon name="code" size={13} />}
      </IconButton>
      {onRerun ? (
        <>
          <IconButton ariaLabel="Rerun" title="Rerun" onClick={() => onRerun(text)}>
            <Icon name="refresh" size={13} />
          </IconButton>
          <IconButton ariaLabel="Save as workflow" title="Save as workflow" onClick={handleSave} disabled={saveWorkflow.isPending}>
            {saved ? <Icon name="check" size={13} className="text-[var(--ao-ok)]" /> : <Icon name="bookmark" size={13} />}
          </IconButton>
        </>
      ) : null}
    </div>
  );
}

function IconButton({ ariaLabel, title, onClick, disabled, children }: {
  ariaLabel: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="w-[26px] h-[26px] flex items-center justify-center rounded-[6px] text-ao-fg-2 hover:bg-ao-bg-3 hover:text-ao-fg-0"
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function copyText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => undefined);
  }
}
