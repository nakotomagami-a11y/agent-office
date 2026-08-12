"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import type { OfficeAgent } from "@/modules/office/hooks/use-office-agents";
import { useExpandedState } from "./expanded-state";

/**
 * Grouped tool-call row for a message bubble. Renders one collapsible
 * block per contiguous run of tool calls the assistant made — expanded,
 * each row shows the arg preview; collapsed, only the summary line.
 *
 * Exported so `chat-thread` can render tool chains directly (grouped
 * across item boundaries), not just as embedded rows in `MessageBubble`.
 */

// ── Tool icon map ─────────────────────────────────────────────────────────
const TOOL_ICONS: Record<string, IconName> = {
  Read: "folder",
  Write: "edit",
  Edit: "edit",
  Bash: "terminal-ao",
  Grep: "search",
  WebFetch: "globe",
  WebSearch: "search",
  Agent: "list",
};

function ToolIcon({ name, size = 13 }: { name: string; size?: number }) {
  const iconName = TOOL_ICONS[name] ?? "wrench";
  return <Icon name={iconName} size={size} />;
}

/** One row per tool call inside an expanded `ToolGroupRow`. */
function ToolCallRow({ name, arg }: { name: string; arg?: string }) {
  const [showIn, setShowIn] = useState(false);
  return (
    <div className="px-[14px] py-[10px] border-t border-[var(--ao-line-0)] first:border-t-0">
      <div className="flex items-center gap-2 text-[12.5px]">
        <span className="w-[18px] h-[18px] flex items-center justify-center text-ao-fg-2 shrink-0"><ToolIcon name={name} /></span>
        <span className="text-ao-fg-0 font-medium">{name}</span>
        {arg && <span className="font-mono text-[11.5px] text-ao-fg-2 px-[6px] py-[1px] bg-ao-bg-3 border border-ao-line-1 rounded-[4px] whitespace-nowrap overflow-hidden text-ellipsis max-w-[360px]">{arg}</span>}
        <span className="ml-auto flex items-center gap-2 text-ao-fg-3 font-mono text-[11px]">
          <span className="inline-flex items-center gap-[5px] py-[1px] px-[6px] rounded-full text-[9px] font-semibold tracking-[0.06em] uppercase font-mono border bg-[var(--ao-ok-soft)] text-[var(--ao-ok)] border-[rgba(78,185,111,0.25)]"><span className="text-[7px]">●</span>ok</span>
        </span>
      </div>
      {arg && (
        <div className="mt-2 flex flex-col gap-[6px]">
          <div className={`border border-[var(--ao-line-0)] rounded-[6px] overflow-hidden bg-[var(--ao-bg-1)]${showIn ? " ao-open" : ""}`}>
            <div
              className="flex items-center gap-2 px-[10px] py-[5px] font-mono text-[10.5px] text-ao-fg-2 uppercase tracking-[0.08em] cursor-pointer hover:text-ao-fg-0"
              onClick={() => setShowIn(!showIn)}
            >
              <Icon name="chevron" size={11} className="transition-transform duration-[180ms] [.ao-open_&]:rotate-90 [.ao-open_&]:text-[var(--ao-accent)]" />
              input
              <span className="ml-auto text-ao-fg-3 normal-case tracking-normal">{arg.length} chars</span>
            </div>
            {showIn && <div className="border-t border-[var(--ao-line-0)] p-[8px_10px] font-mono text-[11.5px] leading-[1.55] text-ao-fg-0 max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words">{arg}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export function ToolGroupRow({
  id,
  tools,
  agent,
  running = false,
  hideAvatar = false,
}: {
  id: string;
  tools: Array<{ id: string; name: string; arg?: string }>;
  agent: OfficeAgent;
  running?: boolean;
  hideAvatar?: boolean;
}) {
  const [open, toggle] = useExpandedState(id);
  const single = tools.length === 1;
  const first = tools[0]!;
  return (
    <div className="flex items-start gap-[12px] relative group/msg">
      {hideAvatar ? (
        <div className="w-[60px] shrink-0" aria-hidden />
      ) : (
        <AgentAvatar unit={agent.unitChoice} size={60} label={agent.name} className="shrink-0" />
      )}
      <div className="flex-1 min-w-0 w-full">
        <div className={`border border-ao-line-1 rounded-[10px] bg-ao-bg-2 overflow-hidden${open ? " ao-open" : ""}`}>
          <div className="flex items-center gap-[10px] px-[14px] py-[10px] cursor-pointer select-none transition-[background] duration-[120ms] hover:bg-ao-bg-3" onClick={toggle}>
            <span className={`w-[6px] h-[6px] rounded-full shrink-0 ${running ? "bg-[var(--ao-ok)] shadow-[0_0_6px_rgba(78,185,111,0.5)] animate-[ao-pulse_1.5s_infinite]" : "bg-[var(--ao-ok)] shadow-[0_0_6px_rgba(78,185,111,0.5)]"}`} />
            <span className="w-[22px] h-[22px] flex items-center justify-center rounded-[6px] bg-ao-bg-3 text-ao-fg-1 shrink-0 border border-ao-line-1"><Icon name="wrench" size={13} /></span>
            <span className="text-[13px] text-ao-fg-0 font-medium flex items-center gap-2 flex-1 min-w-0">
              {single ? (
                <>
                  <ToolIcon name={first.name} />
                  {first.name}
                  {first.arg && <span className="font-mono text-[11.5px] text-ao-fg-2 px-[6px] py-[1px] bg-ao-bg-3 border border-ao-line-1 rounded-[4px] whitespace-nowrap overflow-hidden text-ellipsis max-w-[320px]">{first.arg}</span>}
                </>
              ) : (
                <>
                  <span className="shrink-0 whitespace-nowrap">{tools.length} tool calls</span>
                  <span className="text-ao-fg-2 font-mono text-[11.5px] ml-1 min-w-0 flex-1 truncate">
                    {[...new Set(tools.map((t) => t.name))].join(" · ")}
                  </span>
                </>
              )}
            </span>
            <span className="text-ao-fg-3 transition-transform duration-[180ms] [.ao-open_&]:rotate-90 [.ao-open_&]:text-[var(--ao-accent)]"><Icon name="chevron" size={14} /></span>
          </div>
          {open && (
            <div className="border-t border-[var(--ao-line-0)] p-0">
              {tools.map((t) => (
                <ToolCallRow key={t.id} name={t.name} arg={t.arg} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Re-export the icon helper so `message-bubble.tsx` doesn't need its own
// duplicate — same `TOOL_ICONS` table, same `<Icon>` mapping.
export { ToolIcon, TOOL_ICONS };
