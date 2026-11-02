export type SlashCommand = {
  cmd: string;
  descKey: string;
};

/** Slash commands accepted by the composer. Order = display order in the menu. */
export const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: "/clear", descKey: "composer.command_clear_desc" },
];

export function slashEnterRuns(typed: string, cmd: string): boolean {
  return typed === cmd;
}

export type Attachment = {
  /** Local id for React keying — not persisted. */
  localId: string;
  /** Display name (filename). */
  name: string;
  /** On-disk path returned by the upload endpoint; absent while pending. */
  path?: string;
  /** While true, upload is still in flight. */
  pending: boolean;
  /** Error message if upload failed. The chip stays visible so the user can dismiss it. */
  error?: string;
};

let attachmentCounter = 0;
/** Monotonic local id used purely as a React key while an attachment is pending. */
export function nextAttachmentId(): string {
  return `att-${Date.now().toString(36)}-${attachmentCounter++}`;
}
