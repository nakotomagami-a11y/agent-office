"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import type { Attachment } from "../format/composer-config";

export type ComposerAttachmentChipsProps = {
  attachments: Attachment[];
  onRemove: (localId: string) => void;
};

/** Row of attachment chips above the composer textarea. */
export function ComposerAttachmentChips({ attachments, onRemove }: ComposerAttachmentChipsProps): React.ReactElement | null {
  const t = useTranslations();
  if (attachments.length === 0) return null;
  return (
    <div className="flex gap-[6px] px-[10px] pt-[8px] flex-wrap">
      {attachments.map((a) => (
        <AttachmentChip key={a.localId} attachment={a} onRemove={onRemove} t={t} />
      ))}
    </div>
  );
}

function AttachmentChip({
  attachment: a,
  onRemove,
  t,
}: {
  attachment: Attachment;
  onRemove: (localId: string) => void;
  t: ReturnType<typeof useTranslations>;
}): React.ReactElement {
  const style = a.error
    ? { borderColor: "var(--error)", color: "var(--error)" }
    : a.pending
      ? { opacity: 0.7 }
      : undefined;
  const title = a.error ? t("composer.upload_failed_title", { error: a.error }) : a.path ?? a.name;
  return (
    <span
      className="attach-chip inline-flex items-center gap-[6px] bg-bg-2 border border-line rounded-full text-txt-2 px-[8px] py-[4px] text-[11.5px]"
      title={title}
      style={style}
    >
      {a.pending ? (
        <Icon name="refresh" size={11} className="[animation:spin_1s_linear_infinite]" />
      ) : (
        <Icon name={a.error ? "x" : "folder"} size={11} />
      )}{" "}
      {a.pending ? t("composer.uploading_label") : a.name}
      <button
        type="button"
        className="bg-transparent border-none p-0 text-txt-3 cursor-pointer inline-flex items-center justify-center w-[14px] h-[14px] hover:text-[var(--error)]"
        aria-label={t("composer.remove_chip_aria", { name: a.name })}
        onClick={() => onRemove(a.localId)}
      >
        <Icon name="x" size={10} />
      </button>
    </span>
  );
}
