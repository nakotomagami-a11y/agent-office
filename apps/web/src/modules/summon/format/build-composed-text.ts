import type { Attachment } from "./composer-config";

/**
 * Combine the plain text and any successfully-uploaded attachment paths into
 * the single string the summon request expects. Attachments become a
 * bullet list preceded by a translated intro line.
 *
 * Returns `null` if there's nothing worth sending (empty text + no ready
 * attachments) so the caller can bail early.
 */
export function buildComposedText(
  rawText: string,
  attachments: Attachment[],
  attachmentsIntro: string,
): string | null {
  const value = rawText.trim();
  const ready = attachments.filter((a) => a.path);
  if (!value && ready.length === 0) return null;
  if (ready.length === 0) return value;
  return `${value}\n\n${attachmentsIntro}\n${ready.map((a) => `- ${a.path}`).join("\n")}`.trimStart();
}
