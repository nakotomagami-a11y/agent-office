import type { ContextProfile } from "@agent-office/domain/types";

export type SlashCommand = {
  cmd: string;
  descKey: string;
};

/** Slash commands accepted by the composer. Order = display order in the menu. */
export const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: "/clear", descKey: "composer.command_clear_desc" },
  { cmd: "/branch", descKey: "composer.command_branch_desc" },
  { cmd: "/memory", descKey: "composer.command_memory_desc" },
  { cmd: "/prompt", descKey: "composer.command_prompt_desc" },
  { cmd: "/history", descKey: "composer.command_history_desc" },
];

/** Rotation order for the context-profile toggle button. */
export const PROFILE_CYCLE: ContextProfile[] = ["tight", "balanced", "deep"];

/** Approximate token budget shown next to the profile chip. */
export const PROFILE_TOK: Record<ContextProfile, string> = {
  tight: "~400 tok",
  balanced: "~1.5k tok",
  deep: "~4k tok",
};

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
