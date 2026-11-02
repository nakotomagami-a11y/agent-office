"use client";

import { useState } from "react";
import type { GitStatus } from "@agent-office/domain/types";
import { Icon } from "@/components/ui/icon";

type Kind = "added" | "removed";

const BARS = 24;
const num = (n: number) => n.toLocaleString("en-US");

export function ProjectWorkingTreeCard({
  gitStatus,
  loading,
  lastRunAt,
}: {
  gitStatus: GitStatus | undefined;
  loading: boolean;
  lastRunAt: number | undefined;
}) {
  const [selected, setSelected] = useState<Kind | null>(null);
  const [hovered, setHovered] = useState<Kind | null>(null);
  const focus = hovered ?? selected;

  const isGit = !!gitStatus?.isGit;
  const added = isGit ? gitStatus.added : 0;
  const removed = isGit ? gitStatus.removed : 0;
  const files = isGit ? gitStatus.filesChanged : 0;
  const total = added + removed;
  // A side with any lines keeps at least one bar, however lopsided the diff.
  const nAdd = total ? Math.min(removed ? BARS - 1 : BARS, Math.max(added ? 1 : 0, Math.round((added / total) * BARS))) : 0;
  const nRem = total ? BARS - nAdd : 0;
  const share = (x: number) => `${Math.round((x / total) * 100)}%`;
  const toggle = (k: Kind) => setSelected((s) => (s === k ? null : k));

  const stats = [
    { key: "added" as const, label: "Added", value: isGit ? `+${num(added)}` : "—", color: "var(--green)", swatch: "var(--green)", hint: "Highlight added lines" },
    { key: "removed" as const, label: "Removed", value: isGit ? `−${num(removed)}` : "—", color: "var(--red)", swatch: "var(--red)", hint: "Highlight removed lines" },
    { key: "files" as const, label: "Files", value: isGit ? String(files) : "—", color: "var(--txt)", swatch: "var(--txt-3)", hint: "Files with uncommitted changes" },
  ];

  const tipKind = total ? hovered : null;
  // The card is narrow: a centred 184px tip over a lopsided diff would hang off its edge.
  const tipPct = ((tipKind === "added" ? nAdd / 2 : nAdd + nRem / 2) / BARS) * 100;
  const tipValue = tipKind === "added" ? added : removed;

  return (
    <div className="flex-[1_1_0%] min-w-[min(300px,100%)] rounded-[22px] surface-sheen shadow-[var(--lift)] pt-[20px] px-[22px] pb-[16px] flex flex-col gap-[18px]">
      <div className="flex items-center gap-[12px]">
        <span className="text-[16px] font-bold whitespace-nowrap">Working tree</span>
        {isGit && gitStatus.branch && (
          <span className="flex items-center gap-[6px] min-w-0 px-[10px] py-[4px] rounded-[9px] bg-card-2 border border-edge font-mono text-[11px] font-semibold text-txt-2 whitespace-nowrap">
            <Icon name="branch" size={11} />
            <span className="truncate">{gitStatus.branch}</span>
          </span>
        )}
        <span className="flex-1" />
        {isGit && (
          <span className="flex items-center gap-[10px] font-mono text-[10.5px] whitespace-nowrap">
            <span title="Commits ahead of upstream" style={{ color: gitStatus.ahead ? "var(--green)" : "var(--txt-4)" }}>
              ↑ {gitStatus.ahead}
            </span>
            <span title="Commits behind upstream" style={{ color: gitStatus.behind ? "var(--amber)" : "var(--txt-4)" }}>
              ↓ {gitStatus.behind}
            </span>
          </span>
        )}
      </div>

      {!loading && !isGit ? (
        <div className="flex-1 flex flex-col justify-center gap-[4px]">
          <span className="text-[15px] font-semibold text-txt-3">Not a git repo</span>
          <span className="font-mono text-[10.5px] text-txt-4">no working tree to track for this project</span>
        </div>
      ) : (
        <div className="flex gap-[6px] -mx-[10px]">
          {stats.map((st) => {
            const kind = st.key === "files" || !total ? null : st.key;
            const on = selected === st.key;
            return (
              <div
                key={st.key}
                title={st.hint}
                role={kind ? "button" : undefined}
                tabIndex={kind ? 0 : undefined}
                aria-pressed={kind ? on : undefined}
                onClick={() => kind && toggle(kind)}
                onKeyDown={(e) => {
                  if (kind && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    toggle(kind);
                  }
                }}
                onMouseEnter={() => kind && setHovered(kind)}
                onMouseLeave={() => setHovered(null)}
                className="flex-1 min-w-0 flex flex-col gap-[4px] py-[8px] px-[10px] rounded-[12px] transition-[background,box-shadow] duration-[160ms] ease-[ease] hover:bg-card-2"
                style={{
                  cursor: kind ? "pointer" : "default",
                  background: on ? "var(--card-2)" : undefined,
                  boxShadow: on ? "inset 0 0 0 1px var(--edge-2)" : "none",
                }}
              >
                <span className="flex items-center gap-[7px] text-[12px] font-semibold text-txt-3 whitespace-nowrap">
                  <span
                    className="w-[8px] h-[8px] rounded-[2px] transition-opacity duration-[160ms] ease-[ease]"
                    style={{ background: st.swatch, opacity: !focus || focus === st.key ? 1 : 0.35 }}
                  />
                  {st.label}
                </span>
                <span
                  className="text-[26px] font-extrabold tracking-[-0.035em] leading-[1.1] whitespace-nowrap"
                  style={{ color: st.color }}
                >
                  {st.value}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <span className="flex-1" />

      <div className="flex flex-col gap-[8px]">
        {isGit && (
          <div className="relative flex items-stretch gap-[3px] h-[72px]" onMouseLeave={() => setHovered(null)}>
            {Array.from({ length: BARS }, (_, i) => {
              if (!total) {
                return (
                  <span key={i} className="flex-1 h-full flex flex-col justify-end">
                    <span className="h-[4px] rounded-[3px] bg-[var(--an-cell-empty)]" />
                  </span>
                );
              }
              const kind: Kind = i < nAdd ? "added" : "removed";
              const j = kind === "added" ? i : i - nAdd;
              const n = kind === "added" ? nAdd : nRem;
              const on = focus === kind;
              return (
                <span
                  key={i}
                  onMouseEnter={() => setHovered(kind)}
                  onClick={() => toggle(kind)}
                  className="flex-1 h-full flex flex-col justify-end cursor-pointer transition-opacity duration-[140ms] ease-[ease]"
                  style={{ opacity: focus && !on ? 0.4 : 1 }}
                >
                  <span
                    className="rounded-[3px]"
                    style={{
                      height: `${58 + Math.round(42 * Math.sin(((j + 0.5) / n) * Math.PI))}%`,
                      background: kind === "added" ? "var(--green)" : "var(--red)",
                      opacity: on ? 1 : 0.5,
                      transition: "height 260ms cubic-bezier(.2,.8,.2,1), opacity 140ms ease",
                    }}
                  />
                </span>
              );
            })}
            {tipKind && (
              <div
                className="absolute bottom-[calc(100%+12px)] pointer-events-none z-20 w-[184px] py-[11px] px-[12px] rounded-[13px] bg-card-3 border border-edge-2 shadow-[0_20px_44px_-18px_rgba(0,0,0,.95)] flex flex-col gap-[7px]"
                style={{ left: `${tipPct}%`, transform: `translateX(${tipPct < 25 ? -12 : tipPct > 75 ? -88 : -50}%)` }}
              >
                <div className="flex items-baseline gap-[8px]">
                  <span className="font-mono text-[11.5px] font-bold text-txt">{tipKind === "added" ? "Added" : "Removed"}</span>
                  <span className="flex-1" />
                  <span className="font-mono text-[10px] text-txt-4">{share(tipValue)} of diff</span>
                </div>
                <div className="flex items-center gap-[8px] text-[12px]">
                  <span
                    className="w-[7px] h-[7px] rounded-[2px]"
                    style={{ background: tipKind === "added" ? "var(--green)" : "var(--red)" }}
                  />
                  <span className="text-txt-3">Lines</span>
                  <span className="flex-1" />
                  <span className="font-mono font-bold" style={{ color: tipKind === "added" ? "var(--green)" : "var(--red)" }}>
                    {tipKind === "added" ? "+" : "−"}
                    {num(tipValue)}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-txt-4 pt-[7px] border-t border-edge">
                  across {num(files)} changed file{files === 1 ? "" : "s"}
                </span>
              </div>
            )}
          </div>
        )}
        <div className="flex justify-between gap-[12px] font-mono text-[10px] text-txt-4">
          <span className="truncate">
            {lastRunAt
              ? `last run ${new Date(lastRunAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
              : "no runs yet"}
          </span>
          {isGit && (
            <span className={`whitespace-nowrap ${total ? "text-acc" : ""}`}>
              {total ? `${num(total)} lines uncommitted` : "working tree clean"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
