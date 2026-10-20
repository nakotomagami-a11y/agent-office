"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { formatAgentDisplayName } from "@/lib/agent-display-name";
import type { AgentChange, AgentDiffEntry } from "../hooks/use-agent-migration";

export interface RowSelection {
  /** True → will be copied over (backup taken if a local file exists). */
  accept: boolean;
}

function rowTagKey(entry: AgentDiffEntry): `change_${AgentChange}` | "declined_before" | null {
  if (entry.change) return `change_${entry.change}`;
  return entry.declined ? "declined_before" : null;
}

interface SectionProps {
  title: string;
  subtitle: string;
  tone: "add" | "warn" | "info";
  entries: AgentDiffEntry[];
  /** Row-level accept toggle. `undefined` for read-only sections (onlyLocal). */
  selection?: Record<string, RowSelection>;
  onToggle?: (id: string) => void;
  onSelectAll?: (accept: boolean) => void;
}

const toneStyles: Record<SectionProps["tone"], { text: string; bg: string }> = {
  add:  { text: "text-emerald-300", bg: "bg-emerald-500/15" },
  warn: { text: "text-amber-300",   bg: "bg-amber-500/15" },
  info: { text: "text-ao-fg-2",     bg: "bg-ao-line-1/25" },
};

export function DiffSection({
  title,
  subtitle,
  tone,
  entries,
  selection,
  onToggle,
  onSelectAll,
}: SectionProps) {
  const t = useTranslations("agent_migration");
  if (entries.length === 0) return null;
  const style = toneStyles[tone];

  const acceptedCount = selection
    ? entries.filter((e) => selection[e.id]?.accept).length
    : 0;
  const allAccepted = selection && acceptedCount === entries.length;
  const noneAccepted = selection && acceptedCount === 0;

  return (
    <section className="flex flex-col gap-[8px]">
      <header className="flex items-center gap-[10px] px-1">
        <span className="w-[3px] h-[14px] bg-ao-accent rounded-full shrink-0" />
        <h3 className="text-[13px] font-semibold text-ao-fg-0 m-0">{title}</h3>
        <span className={`inline-flex items-center rounded-[4px] px-[6px] py-[2px] text-[10.5px] font-mono tabular-nums leading-none ${style.text} ${style.bg}`}>
          {entries.length}
        </span>
        <span className="text-[11.5px] text-ao-fg-3 font-mono">{subtitle}</span>
        {selection && onSelectAll && entries.length > 1 && (
          <span className="ml-auto flex items-center gap-[4px] text-[11px] font-mono">
            <button
              type="button"
              onClick={() => onSelectAll(true)}
              disabled={allAccepted}
              className="text-ao-fg-2 hover:text-ao-fg-0 disabled:opacity-40 disabled:cursor-default cursor-pointer bg-transparent border-0 p-[3px_6px] rounded-[4px] hover:bg-ao-bg-3 transition-[background-color,color] duration-[120ms]"
            >
              {t("accept_all")}
            </button>
            <span className="text-ao-fg-3" aria-hidden>·</span>
            <button
              type="button"
              onClick={() => onSelectAll(false)}
              disabled={noneAccepted}
              className="text-ao-fg-2 hover:text-ao-fg-0 disabled:opacity-40 disabled:cursor-default cursor-pointer bg-transparent border-0 p-[3px_6px] rounded-[4px] hover:bg-ao-bg-3 transition-[background-color,color] duration-[120ms]"
            >
              {t("skip_all")}
            </button>
          </span>
        )}
      </header>

      <ul className="flex flex-col gap-[4px] list-none m-0 p-0">
        {entries.map((entry) => {
          const sel = selection?.[entry.id];
          const interactive = !!selection && !!onToggle;
          const accepted = sel?.accept ?? false;
          const displayName = formatAgentDisplayName(entry.name);
          const tagKey = rowTagKey(entry);
          return (
            <li key={entry.id}>
              <label
                className={[
                  "flex items-start gap-[10px] w-full text-left px-[12px] py-[9px] rounded-[8px]",
                  "border transition-[background-color,border-color] duration-[120ms]",
                  interactive
                    ? "cursor-pointer border-ao-line-1 hover:bg-ao-bg-3"
                    : "border-ao-line-1/60 bg-ao-bg-2/40",
                  accepted && "bg-ao-accent-soft border-ao-accent-line",
                ].filter(Boolean).join(" ")}
              >
                {interactive ? (
                  <input
                    type="checkbox"
                    className="mt-[3px] shrink-0 accent-ao-accent cursor-pointer"
                    checked={accepted}
                    onChange={() => onToggle!(entry.id)}
                  />
                ) : (
                  <span className="mt-[3px] shrink-0 w-[13px] h-[13px] rounded-[3px] border border-ao-line-2 bg-ao-bg-3 flex items-center justify-center text-ao-fg-3">
                    <Icon name="check" size={9} />
                  </span>
                )}
                <span className="flex-1 min-w-0 flex flex-col gap-[2px]">
                  <span className="flex items-center gap-[8px] flex-wrap">
                    <span className="text-[13px] font-semibold text-ao-fg-0">{displayName}</span>
                    <span className="font-mono text-[10.5px] text-ao-fg-3">{entry.id}</span>
                    {tagKey && (
                      <span className={`rounded-[4px] px-[6px] py-[1px] text-[10.5px] font-mono ${entry.change === "both" || entry.change === "edited_locally" ? "text-amber-300 bg-amber-500/15" : "text-ao-fg-2 bg-ao-line-1/25"}`}>
                        {t(tagKey)}
                      </span>
                    )}
                  </span>
                  {entry.description && (
                    <span className="text-[11.5px] text-ao-fg-2 leading-[1.5]">
                      {entry.description}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
