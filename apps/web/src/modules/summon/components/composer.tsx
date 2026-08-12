"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { useAgentPrompts } from "../hooks/use-agent-prompts";
import { clearDraft, saveDraft } from "../format/draft-store";
import { WorkflowPickerDialog } from "@/modules/workflows/components/workflow-picker-dialog";
import type { ContextProfile } from "@agent-office/domain/types";
import { SLASH_COMMANDS } from "../format/composer-config";
import { autosizeTextarea } from "../format/textarea-autosize";
import { buildComposedText } from "../format/build-composed-text";
import { useComposerAttachments } from "../hooks/use-composer-attachments";
import { useComposerDraft } from "../hooks/use-composer-draft";
import { useComposerKeyboard } from "../hooks/use-composer-keyboard";
import { useComposerMenus } from "../hooks/use-composer-menus";
import { ComposerSlashMenu } from "./composer-slash-menu";
import { ComposerPromptsMenu } from "./composer-prompts-menu";
import { ComposerAttachmentChips } from "./composer-attachment-chips";
import { ComposerToolbar } from "./composer-toolbar";

export type ComposerProps = {
  disabled?: boolean;
  onSubmit: (text: string) => void;
  onAbort?: () => void;
  abortable?: boolean;
  agentId: string;
  projectId?: string;
  modelChip?: string;
  cwdChip?: string;
  seed?: string;
  onSeedConsumed?: () => void;
  onCommand?: (cmd: string) => void;
  draftKey?: string;
  contextProfile?: ContextProfile;
  onProfileChange?: (p: ContextProfile) => void;
};

export function Composer(props: ComposerProps) {
  const t = useTranslations();
  const [value, setValue] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: savedPrompts = [] } = useAgentPrompts(props.agentId);
  const att = useComposerAttachments({ agentId: props.agentId, projectId: props.projectId });
  useComposerDraft({ draftKey: props.draftKey, seed: props.seed, textRef, setValue, onSeedConsumed: props.onSeedConsumed });
  const menus = useComposerMenus(value, savedPrompts);

  // Persist the draft at most once per idle pause instead of once per keystroke
  // — the old per-character PUT hammered the drafts DB write and added input
  // latency on the native (WebKitGTK) build. Flush on unmount so nothing is lost.
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraft = useRef<{ key: string; text: string } | null>(null);
  const flushDraft = () => {
    if (draftTimer.current) { clearTimeout(draftTimer.current); draftTimer.current = null; }
    if (pendingDraft.current) { void saveDraft(pendingDraft.current.key, pendingDraft.current.text); pendingDraft.current = null; }
  };
  const cancelDraftSave = () => {
    if (draftTimer.current) { clearTimeout(draftTimer.current); draftTimer.current = null; }
    pendingDraft.current = null;
  };
  useEffect(() => flushDraft, []);

  const onChange = (next: string) => {
    setValue(next);
    if (props.draftKey) {
      pendingDraft.current = { key: props.draftKey, text: next };
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(flushDraft, 400);
    }
    menus.updateFor(next);
    autosizeTextarea(textRef.current);
  };

  const insertSlash = (cmd: string) => {
    onChange(cmd + " ");
    menus.closeAll();
    textRef.current?.focus();
  };

  const selectPrompt = (body: string) => {
    onChange(body);
    menus.closeAll();
    textRef.current?.focus();
  };

  const send = () => {
    if (props.disabled || att.hasPending) return;
    cancelDraftSave();
    if (handleSlashSend(value, props.onCommand, props.draftKey, () => { setValue(""); menus.closeAll(); })) return;
    const composed = buildComposedText(value, att.attachments, t("composer.attachments_intro"));
    if (composed === null) return;
    props.onSubmit(composed);
    if (props.draftKey) void clearDraft(props.draftKey);
    setValue("");
    att.clearAll();
    menus.closeAll();
    if (textRef.current) textRef.current.value = "";
    autosizeTextarea(textRef.current);
    textRef.current?.focus();
  };

  const onKey = useComposerKeyboard({
    slashOpen: menus.slashOpen,
    setSlashOpen: menus.setSlashOpen,
    slashIdx: menus.slashIdx,
    setSlashIdx: menus.setSlashIdx,
    filteredSlashLength: menus.filteredSlash.length,
    onPickSlash: () => { const picked = menus.filteredSlash[menus.slashIdx]; if (picked) insertSlash(picked.cmd); },
    promptsOpen: menus.promptsOpen,
    setPromptsOpen: menus.setPromptsOpen,
    promptsIdx: menus.promptsIdx,
    setPromptsIdx: menus.setPromptsIdx,
    filteredPromptsLength: menus.filteredPrompts.length,
    onPickPrompt: () => { const picked = menus.filteredPrompts[menus.promptsIdx]; if (picked) selectPrompt(picked.body); },
    onSend: send,
    onOpenPicker: () => setPickerOpen(true),
  });

  const sendDisabled = props.disabled || att.hasPending || (!value.trim() && !att.hasReady);

  return (
    <>
      <WorkflowPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(body) => { onChange(body); textRef.current?.focus(); }}
      />
      <ComposerShell att={att}>
        <ComposerMenuLayer menus={menus} onInsertSlash={insertSlash} onSelectPrompt={selectPrompt} />
        <ComposerInputShell dragOver={att.dragOver} attachments={att.attachments} onRemoveAttachment={att.removeAttachment}>
          <textarea
            ref={textRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKey}
            onPaste={att.onPaste}
            placeholder={t("composer.input_placeholder")}
            aria-label={t("composer.input_aria")}
            rows={1}
            className="border-none bg-transparent resize-none text-txt w-full px-[14px] pt-[12px] pb-[6px] font-[inherit] text-[14px] leading-[1.55] outline-none min-h-[48px] max-h-[220px] placeholder:text-txt-4"
          />
          <ComposerToolbar
            cwdChip={props.cwdChip}
            modelChip={props.modelChip}
            contextProfile={props.contextProfile ?? "balanced"}
            onProfileChange={props.onProfileChange}
            abortable={props.abortable}
            onAbort={props.onAbort}
            sendDisabled={sendDisabled}
            onSend={send}
            onAttachClick={() => fileRef.current?.click()}
            onSlashClick={() => onChange("/")}
            onPromptPickerOpen={() => setPickerOpen(true)}
          />
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              for (const file of Array.from(e.target.files ?? [])) void att.uploadOne(file);
              if (fileRef.current) fileRef.current.value = "";
            }}
            aria-hidden
          />
        </ComposerInputShell>
      </ComposerShell>
    </>
  );
}

/**
 * If the current text is a slash command that maps to a UI action, invoke it
 * and clear the draft. Returns true when a command was handled so the caller
 * can bail out of the normal submit path.
 */
function handleSlashSend(
  raw: string,
  onCommand: ((cmd: string) => void) | undefined,
  draftKey: string | undefined,
  resetLocalState: () => void,
): boolean {
  const v = raw.trim();
  if (!v.startsWith("/") || !onCommand) return false;
  const [cmd] = v.split(/\s+/);
  if (!cmd || !SLASH_COMMANDS.some((s) => s.cmd === cmd)) return false;
  onCommand(cmd);
  if (draftKey) void clearDraft(draftKey);
  resetLocalState();
  return true;
}

/** Outer wrapper — background, padding, drag surface. */
function ComposerShell({
  att,
  children,
}: {
  att: ReturnType<typeof useComposerAttachments>;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      className="bg-bg-1 px-[24px] pt-[12px] pb-[18px]"
      onDragOver={att.onDragOver}
      onDragLeave={att.onDragLeave}
      onDrop={att.onDrop}
    >
      <div className="max-w-[760px] mx-auto relative">{children}</div>
    </div>
  );
}

/** Renders whichever menu (slash/prompts) is currently open. */
function ComposerMenuLayer({
  menus,
  onInsertSlash,
  onSelectPrompt,
}: {
  menus: ReturnType<typeof useComposerMenus>;
  onInsertSlash: (cmd: string) => void;
  onSelectPrompt: (body: string) => void;
}): React.ReactElement | null {
  if (menus.slashOpen) {
    return (
      <ComposerSlashMenu
        filtered={menus.filteredSlash}
        activeIdx={menus.slashIdx}
        onHover={menus.setSlashIdx}
        onPick={onInsertSlash}
      />
    );
  }
  if (menus.promptsOpen) {
    return (
      <ComposerPromptsMenu
        filtered={menus.filteredPrompts}
        activeIdx={menus.promptsIdx}
        onHover={menus.setPromptsIdx}
        onPick={onSelectPrompt}
      />
    );
  }
  return null;
}

/** Bordered wrapper around the textarea + toolbar + attachment chips. */
function ComposerInputShell({
  dragOver,
  attachments,
  onRemoveAttachment,
  children,
}: {
  dragOver: boolean;
  attachments: React.ComponentProps<typeof ComposerAttachmentChips>["attachments"];
  onRemoveAttachment: (localId: string) => void;
  children: React.ReactNode;
}): React.ReactElement {
  const t = useTranslations();
  return (
    <div
      className={"bg-bg-1 border-[1.5px] border-line-2 rounded-[16px] [box-shadow:var(--shadow-1)] transition-[border-color] duration-[160ms] focus-within:border-[var(--acc)]" + (dragOver ? " drag-over" : "")}
      aria-label={dragOver ? t("composer.drop_to_attach") : undefined}
    >
      {dragOver ? (
        <div className="drag-overlay" aria-hidden>
          <Icon name="attach" size={20} />
          {t("composer.drop_to_attach")}
        </div>
      ) : null}
      <ComposerAttachmentChips attachments={attachments} onRemove={onRemoveAttachment} />
      {children}
    </div>
  );
}
