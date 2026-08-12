"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { ACCENT_BTN } from "@/lib/button-styles";
import type { ContextProfile } from "@agent-office/domain/types";

export type ComposerToolbarProps = {
  cwdChip: string | undefined;
  modelChip: string | undefined;
  contextProfile: ContextProfile;
  onProfileChange: ((p: ContextProfile) => void) | undefined;
  abortable: boolean | undefined;
  onAbort: (() => void) | undefined;
  sendDisabled: boolean;
  onSend: () => void;
  onAttachClick: () => void;
  onSlashClick: () => void;
  onPromptPickerOpen: () => void;
};

/**
 * Bottom action bar of the composer — attach/slash/prompt buttons, context
 * profile chip, cwd/model chips, abort or send.
 */
export function ComposerToolbar(props: ComposerToolbarProps): React.ReactElement {
  const t = useTranslations();
  return (
    <div className="flex items-center gap-[4px] px-[8px] pb-[8px] pt-[6px]">
      <Button variant="ghost" size="sm" title={t("composer.attach_title")} onClick={props.onAttachClick} aria-label={t("composer.attach_title")}>
        <Icon name="attach" />
      </Button>
      <Button variant="ghost" size="sm" title={t("composer.slash_insert_title")} onClick={props.onSlashClick} aria-label={t("composer.slash_insert_aria")}>
        <Icon name="slash" />
      </Button>
      <Button variant="ghost" size="sm" title={`${t("workflows.open_picker")} (Ctrl+P)`} aria-label={t("workflows.open_picker")} onClick={props.onPromptPickerOpen}>
        <Icon name="sparkle" />
      </Button>
      <div className="ml-auto flex items-center gap-[6px]">
        {props.abortable ? (
          <Button size="sm" onClick={props.onAbort}>
            <Icon name="stop" /> {t("common.abort")}
          </Button>
        ) : (
          <SendShortcutHint t={t} />
        )}
        <SendButton disabled={props.sendDisabled} onSend={props.onSend} label={t("composer.send_label")} />
      </div>
    </div>
  );
}

function SendShortcutHint({ t }: { t: ReturnType<typeof useTranslations> }): React.ReactElement {
  const kbd = (label: string) => (
    <span className="inline-block bg-bg-1 text-txt-2 px-[5px] py-[1px] border border-b-2 border-line-2 rounded font-mono text-[10.5px]">
      {label}
    </span>
  );
  return (
    <span className="text-[11px] text-[var(--txt-4)] font-mono">
      {kbd("⏎")} {t("composer.shortcut_send")} · {kbd("⇧⏎")} {t("composer.shortcut_newline")}
    </span>
  );
}

function SendButton({ disabled, onSend, label }: { disabled: boolean; onSend: () => void; label: string }): React.ReactElement {
  return (
    <button
      type="button"
      className={`send-btn ${ACCENT_BTN} inline-flex items-center justify-center cursor-pointer w-[32px] h-[32px] rounded-[10px]`}
      onClick={onSend}
      disabled={disabled}
      aria-label={label}
    >
      <Icon name="send" />
    </button>
  );
}
