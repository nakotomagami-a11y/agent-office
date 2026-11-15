"use client";

import { useState } from "react";
import type { MessageOrigin } from "@agent-office/domain/types";
import { Icon } from "@/components/ui/icon";
import { MarkdownView } from "@/components/ui/markdown-view";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ImageStrip } from "./message-bubble";
import { extractImages, stripAttachmentFooter } from "../format/message-format";
import { queuedTitle } from "../format/queued-title";

export interface QueuedMessage {
  id: string;
  text: string;
  origin?: MessageOrigin;
}

export function QueuedMessages({ items, onCancel }: { items: QueuedMessage[]; onCancel?: (id: string) => void }) {
  return (
    <div className="rounded-[10px] border border-dashed border-ao-line-1 bg-ao-bg-2/60 flex flex-col divide-y divide-ao-line-1">
      {items.map((q, i) => (
        <QueuedRow
          key={q.id}
          item={q}
          position={items.length > 1 ? `${i + 1}/${items.length}` : undefined}
          onCancel={onCancel ? () => onCancel(q.id) : undefined}
        />
      ))}
    </div>
  );
}

function QueuedRow({ item, position, onCancel }: { item: QueuedMessage; position?: string; onCancel?: () => void }) {
  const [open, setOpen] = useState(false);
  const system = item.origin === "system";
  const title = queuedTitle(item.text);
  return (
    <div data-origin={system ? "system" : "user"}>
      <div className="flex items-center gap-[8px] pl-[10px] pr-[6px] h-[34px]">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="min-w-0 flex-1 flex items-center gap-[8px] h-full bg-transparent border-0 p-0 cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-[var(--acc)] focus-visible:outline-offset-2"
        >
          <Icon name={open ? "chevron-down" : "chevron"} className="shrink-0 w-[12px] h-[12px] text-ao-fg-3" aria-hidden />
          {system ? (
            <Icon name="terminal-ao" className="shrink-0 w-[14px] h-[14px] text-ao-fg-3" aria-hidden />
          ) : (
            <UserAvatar size={16} className="shrink-0" />
          )}
          <span className="sr-only">{system ? "Agent Office" : "You"}</span>
          <span className="shrink-0 font-mono text-[10px] tracking-[0.06em] uppercase text-ao-fg-3">
            queued{position ? ` ${position}` : ""}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-ao-fg-1" title={title}>{title}</span>
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label={system ? "Dismiss this notice" : "Cancel queued message"}
            title={system ? "Dismiss — the agent will not be woken" : "Cancel"}
            className="shrink-0 w-[20px] h-[20px] rounded-[6px] border border-transparent text-ao-fg-3 flex items-center justify-center p-0 cursor-pointer bg-transparent hover:bg-ao-bg-3 hover:text-ao-fg-1 hover:border-ao-line-1 focus-visible:outline-2 focus-visible:outline-[var(--acc)] focus-visible:outline-offset-2"
          >
            <Icon name="circle-x" className="w-[12px] h-[12px]" aria-hidden />
          </button>
        ) : null}
      </div>
      {open ? <QueuedBody item={item} system={system} /> : null}
    </div>
  );
}

function QueuedBody({ item, system }: { item: QueuedMessage; system: boolean }) {
  return (
    <div className="pl-[30px] pr-[14px] pb-[10px] text-ao-fg-1">
      {system ? (
        <div className="ao-prose ao-prose-sm">
          <MarkdownView text={item.text} />
        </div>
      ) : (
        <div className="text-[13px] leading-[1.55] whitespace-pre-wrap [overflow-wrap:anywhere]">
          {stripAttachmentFooter(item.text)}
          <ImageStrip urls={extractImages(item.text)} />
        </div>
      )}
    </div>
  );
}
