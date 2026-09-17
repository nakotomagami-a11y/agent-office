"use client";

import { memo, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import type { OfficeAgent } from "@/modules/office/hooks/use-office-agents";
import { useExpandedState } from "./expanded-state";
import { highlight } from "@/components/ui/highlight";
import { prettyPrintToolArg } from "../format/message-format";

/**
 * Grouped tool-call row for a message bubble. Renders one contiguous run
 * of tool calls the assistant made as a flat activity list — bold tool
 * name, plain gray arg preview, no per-row card/border. Expanded by
 * default (this is the "what did the agent actually do" trail; hiding it
 * behind a click defeats the point), each row's own arg can still be
 * expanded further to see the full, untruncated input.
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

/**
 * One flat row per tool call. No card, no per-row border — just a bullet,
 * the bold tool name, and a plain gray arg preview, matching the reference
 * design's activity-log treatment. Clicking a row with an arg reveals the
 * full untruncated input beneath it. We don't have per-tool duration data
 * from the backend yet for *completed* calls (that's a schema gap, flagged
 * separately) — but "is this the one executing right now" we do know, so
 * that row gets a "running" label in the same slot a duration would use.
 *
 * `running` also pulses the bullet — used on the last row of the last turn
 * while the run is still streaming, so "still working" stays visible even
 * though short tool chains (the common case) render with no group header
 * to put that indicator on otherwise.
 */
function ToolCallRow({ name, arg, running = false }: { name: string; arg?: string; running?: boolean }) {
  const [showIn, setShowIn] = useState(false);
  // Compute the highlighted arg ONLY when the row is actually expanded. It is
  // only rendered under `showIn` below, but historical tool trails are now
  // persistent (48h), so eagerly highlighting every collapsed row's arg on
  // mount was a big chunk of the chat-open lag. Lazy = zero cost until clicked.
  const pretty = useMemo(() => {
    if (!arg || !showIn) return "";
    const { text, json } = prettyPrintToolArg(arg);
    return highlight(text, json ? "json" : "");
  }, [arg, showIn]);
  return (
    <div className="px-[14px] py-[7px]">
      <div
        className={`flex items-center gap-[10px] text-[12.5px] ${arg ? "cursor-pointer" : ""}`}
        onClick={arg ? () => setShowIn(!showIn) : undefined}
      >
        <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${running ? "bg-[var(--ao-ok)] shadow-[0_0_6px_rgba(78,185,111,0.5)] animate-[ao-pulse_1.5s_infinite] transform-gpu [will-change:opacity]" : "bg-ao-fg-3"}`} aria-hidden />
        <span className="text-ao-fg-0 font-semibold shrink-0">{name}</span>
        {arg && (
          <span className="font-mono text-ao-fg-3 truncate min-w-0">{arg}</span>
        )}
        <span className="flex-1 min-w-[12px] h-px bg-[var(--line)] opacity-55" aria-hidden />
        {running && (
          <span className="shrink-0 font-mono text-[11px] text-[var(--ao-accent)]">running</span>
        )}
        {!running && arg && (
          <Icon
            name="chevron"
            size={11}
            className={`shrink-0 transition-transform duration-[180ms] text-ao-fg-3 ${showIn ? "rotate-90 text-[var(--ao-accent)]" : ""}`}
          />
        )}
      </div>
      {showIn && arg && (
        <pre
          className="ao-tool-arg mt-[6px] ml-[15px] border border-[var(--ao-line-0)] rounded-[6px] p-[8px_10px] font-mono text-[11.5px] leading-[1.55] text-ao-fg-1 max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words bg-[var(--ao-bg-1)]"
          dangerouslySetInnerHTML={{ __html: pretty }}
        />
      )}
    </div>
  );
}

/** Above this many tool calls in one turn, the reference's "just list them
 *  flat" approach stops scaling — collapse behind a summary line instead.
 *  Below it, render the flat activity list directly with no header at all,
 *  matching the reference exactly (it never shows a group toggle). */
const COLLAPSE_THRESHOLD = 8;

type ToolGroupRowProps = {
  id: string;
  tools: Array<{ id: string; name: string; arg?: string }>;
  agent: OfficeAgent;
  running?: boolean;
  hideAvatar?: boolean;
};

function ToolGroupRowImpl({
  id,
  tools,
  agent,
  running = false,
  hideAvatar = false,
}: ToolGroupRowProps) {
  const longChain = tools.length > COLLAPSE_THRESHOLD;
  const [open, toggle] = useExpandedState(id, !longChain);
  return (
    <div className="flex items-start gap-[12px] relative group/msg">
      {hideAvatar ? (
        <div className="w-[60px] shrink-0" aria-hidden />
      ) : (
        <AgentAvatar unit={agent.unitChoice} size={60} label={agent.name} className="shrink-0" />
      )}
      <div className="flex-1 min-w-0 w-full">
        {longChain && (
          <div className="flex items-center gap-[8px] px-[2px] py-[3px] cursor-pointer select-none text-ao-fg-3 hover:text-ao-fg-1 transition-colors duration-[120ms]" onClick={toggle}>
            <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${running ? "bg-[var(--ao-ok)] shadow-[0_0_6px_rgba(78,185,111,0.5)] animate-[ao-pulse_1.5s_infinite] transform-gpu [will-change:opacity]" : "bg-ao-fg-3"}`} />
            <span className="text-[11px] font-mono uppercase tracking-[0.06em]">{tools.length} tool calls</span>
            <Icon name="chevron" size={11} className={`transition-transform duration-[180ms] ${open ? "rotate-90 text-[var(--ao-accent)]" : ""}`} />
          </div>
        )}
        {open && (
          <div className="flex flex-col">
            {tools.map((t, i) => (
              <ToolCallRow key={t.id} name={t.name} arg={t.arg} running={running && i === tools.length - 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Memoized like MessageBubble so a streaming re-render doesn't re-render every
 * completed tool chain. ChatThread rebuilds the `tools` array on every render
 * (`row.tools.map(...)`), so the default shallow compare would never hit —
 * hence a custom comparator that compares the tools element-wise (id/name/arg)
 * plus the scalar props. `agent` is referentially stable (a ChatThread prop),
 * so a reference check is enough for it.
 */
function toolGroupRowsEqual(a: ToolGroupRowProps, b: ToolGroupRowProps): boolean {
  if (a.id !== b.id || a.running !== b.running || a.hideAvatar !== b.hideAvatar || a.agent !== b.agent) {
    return false;
  }
  if (a.tools.length !== b.tools.length) return false;
  for (let i = 0; i < a.tools.length; i++) {
    const ta = a.tools[i]!;
    const tb = b.tools[i]!;
    if (ta.id !== tb.id || ta.name !== tb.name || ta.arg !== tb.arg) return false;
  }
  return true;
}

export const ToolGroupRow = memo(ToolGroupRowImpl, toolGroupRowsEqual);

// Re-export the icon helper so `message-bubble.tsx` doesn't need its own
// duplicate — same `TOOL_ICONS` table, same `<Icon>` mapping.
export { ToolIcon, TOOL_ICONS };
