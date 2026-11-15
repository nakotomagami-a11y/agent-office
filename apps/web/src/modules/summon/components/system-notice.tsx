/**
 * A message Agent Office wrote into the conversation itself — today only the
 * background-shell watcher reporting a finished job.
 *
 * These go through the same `sendMessage` the reply box uses, so before this
 * they rendered as the USER'S message: their avatar, their bubble, their
 * queue. The user could not tell what they had said from what the app had.
 *
 * Deliberately not a user bubble and not an agent bubble: left-aligned, full
 * width, monospace label, no avatar. It should be impossible to mistake for
 * either side of the conversation.
 */
"use client";

import { Icon } from "@/components/ui/icon";
import { MarkdownView } from "@/components/ui/markdown-view";

export function SystemNotice({ text }: { text: string }) {
  return (
    <div
      className="relative w-full rounded-[10px] border border-ao-line-1 bg-ao-bg-2/60 px-[14px] py-[11px] flex items-start gap-[10px]"
      data-origin="system"
    >
      <Icon name="terminal-ao" className="mt-[3px] shrink-0 w-[14px] h-[14px] text-ao-fg-3" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="mb-[4px] font-mono text-[10px] tracking-[0.08em] uppercase text-ao-fg-3">
          Agent Office
        </div>
        <div className="ao-prose ao-prose-sm">
          <MarkdownView text={text} />
        </div>
      </div>
    </div>
  );
}
