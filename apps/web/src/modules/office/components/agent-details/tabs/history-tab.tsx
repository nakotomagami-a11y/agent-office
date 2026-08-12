"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/ui/icon";
import { formatCompactNumber } from "@/modules/runs/format/format-run-meta";
import { useAgentHistory } from "@/modules/office/hooks/use-agent-history";
import {
  formatHistoryDuration,
  formatRelativeTime,
  runTokens,
} from "@/modules/office/derive/history-format";

export function HistoryTab({ agentId, instanceId }: { agentId: string; instanceId: string | null }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);

  const {
    isLoading,
    allRuns,
    totalCost,
    totalTokens,
    successRate,
    groups,
    query: q,
    setQuery: setQ,
    filter,
    setFilter,
    wipe,
    isWiping,
  } = useAgentHistory(agentId, instanceId, { onWiped: () => setConfirmWipe(false) });

  if (isLoading) {
    return (
      <div className="px-6 pt-5 pb-6 flex-1 flex flex-col">
        <Skeleton width="100%" height={180} />
      </div>
    );
  }

  return (
    <div className="px-6 pt-5 pb-6 flex-1 flex flex-col">
      {/* Stats row */}
      <div className="flex flex-wrap gap-[10px] mb-[16px] [&>*]:basis-[calc(25%-8px)]">
        <div className="p-[12px_14px] bg-ao-bg-2 border border-ao-line-1 rounded-ao-md">
          <div className="text-[10.5px] text-ao-fg-2 uppercase tracking-[0.1em] font-mono mb-[4px]">Total runs</div>
          <div className="text-[18px] font-bold text-ao-fg-0">{formatCompactNumber(allRuns.length)}</div>
        </div>
        <div className="p-[12px_14px] bg-ao-bg-2 border border-ao-line-1 rounded-ao-md">
          <div className="text-[10.5px] text-ao-fg-2 uppercase tracking-[0.1em] font-mono mb-[4px]">Tokens used</div>
          <div className="text-[18px] font-bold text-ao-fg-0">{formatCompactNumber(totalTokens)}</div>
        </div>
        <div className="p-[12px_14px] bg-ao-bg-2 border border-ao-line-1 rounded-ao-md">
          <div className="text-[10.5px] text-ao-fg-2 uppercase tracking-[0.1em] font-mono mb-[4px]">Spend</div>
          <div className="text-[18px] font-bold text-ao-fg-0">${totalCost.toFixed(3)}</div>
        </div>
        <div className="p-[12px_14px] bg-ao-bg-2 border border-ao-line-1 rounded-ao-md">
          <div className="text-[10.5px] text-ao-fg-2 uppercase tracking-[0.1em] font-mono mb-[4px]">Success rate</div>
          <div className="text-[18px] font-bold text-ao-fg-0">
            {successRate}%
            <span className={`text-[11px] font-mono ml-[4px] ${successRate < 90 && allRuns.length > 0 ? "text-ao-bad" : "text-ao-ok"}`}>
              {allRuns.length === 0 ? "" : successRate >= 90 ? "good" : "watch"}
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-[10px] mb-[16px]">
        <div className="flex-1 flex items-center gap-[10px] px-[14px] py-[9px] bg-ao-bg-2 border border-ao-line-1 rounded-ao-md text-ao-fg-2 focus-within:border-[var(--ao-accent-line)] focus-within:shadow-[0_0_0_3px_var(--ao-accent-softer)]">
          <Icon name="search" size={14} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search prompts, run IDs…"
            className="flex-1 bg-transparent border-0 outline-none text-ao-fg-0 placeholder:text-[var(--ao-fg-3)]"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear" className="text-[var(--ao-fg-3)] leading-none text-base">
              ×
            </button>
          )}
        </div>
        <button type="button" className={`inline-flex items-center gap-2 px-[14px] py-[9px] rounded-ao-md border text-[13px] transition-[color,border-color] duration-[120ms] ${filter === "all" ? "bg-ao-accent-soft border-ao-accent-line text-ao-accent" : "bg-ao-bg-2 border-ao-line-1 text-ao-fg-1 hover:text-ao-fg-0 hover:border-ao-line-2"}`} onClick={() => setFilter("all")}>
          All
        </button>
        <button type="button" className={`inline-flex items-center gap-2 px-[14px] py-[9px] rounded-ao-md border text-[13px] transition-[color,border-color] duration-[120ms] ${filter === "ok" ? "bg-ao-accent-soft border-ao-accent-line text-ao-accent" : "bg-ao-bg-2 border-ao-line-1 text-ao-fg-1 hover:text-ao-fg-0 hover:border-ao-line-2"}`} onClick={() => setFilter("ok")}>
          <span className="inline-flex items-center gap-[5px] py-px px-[6px] rounded-full text-[9px] font-semibold tracking-[0.06em] uppercase font-mono border bg-[var(--ao-ok-soft)] text-[var(--ao-ok)] border-[rgba(78,185,111,0.25)]"><span className="text-[7px]">●</span>ok</span>
        </button>
        <button type="button" className={`inline-flex items-center gap-2 px-[14px] py-[9px] rounded-ao-md border text-[13px] transition-[color,border-color] duration-[120ms] ${filter === "bad" ? "bg-ao-accent-soft border-ao-accent-line text-ao-accent" : "bg-ao-bg-2 border-ao-line-1 text-ao-fg-1 hover:text-ao-fg-0 hover:border-ao-line-2"}`} onClick={() => setFilter("bad")}>
          <span className="inline-flex items-center gap-[5px] py-px px-[6px] rounded-full text-[9px] font-semibold tracking-[0.06em] uppercase font-mono border bg-[var(--ao-bad-soft)] text-[var(--ao-bad)] border-[rgba(217,83,79,0.25)]"><span className="text-[7px]">●</span>failed</span>
        </button>
        <div className="flex-1" />
        {confirmWipe ? (
          <div className="flex items-center gap-[6px]">
            <span className="text-xs text-ao-fg-2">Wipe all runs?</span>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-[14px] py-[9px] rounded-ao-md bg-ao-bg-2 border border-ao-bad text-ao-bad text-[13px] hover:text-ao-fg-0 hover:border-ao-line-2"
              onClick={() => wipe()}
              disabled={isWiping}
            >
              {isWiping ? "Wiping…" : "Yes, wipe"}
            </button>
            <button type="button" className="inline-flex items-center gap-2 px-[14px] py-[9px] rounded-ao-md bg-ao-bg-2 border border-ao-line-1 text-ao-fg-1 text-[13px] hover:text-ao-fg-0 hover:border-ao-line-2" onClick={() => setConfirmWipe(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-2 px-[14px] py-[9px] rounded-ao-md bg-ao-bg-2 border border-ao-line-1 text-ao-fg-3 text-[13px] hover:text-ao-fg-0 hover:border-ao-line-2"
            onClick={() => setConfirmWipe(true)}
            disabled={allRuns.length === 0}
          >
            <Icon name="trash" size={13} /> Wipe
          </button>
        )}
      </div>

      {/* Run list */}
      {groups.length === 0 ? (
        <div className="bg-ao-bg-2 border border-ao-line-1 rounded-ao-lg overflow-hidden">
          <div className="p-[var(--ao-pad-card)] !text-center !p-10 !text-ao-fg-2">
            <Icon name="search" size={28} />
            <div className="mt-[10px] text-sm">
              {allRuns.length === 0 ? "No runs yet." : "No runs match your filter."}
            </div>
          </div>
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.day} className="mb-[14px]">
            {/* Day header */}
            <div className="flex items-center gap-[12px] px-[4px] pb-[10px] pt-[8px] text-[11.5px] text-ao-fg-2 font-mono uppercase tracking-[0.08em]">
              <span>{g.day}</span>
              <span className="bg-ao-bg-3 border border-ao-line-1 text-ao-fg-1 px-[8px] py-[2px] rounded-full tracking-[0.02em] normal-case whitespace-nowrap text-[11.5px] not-italic">
                {g.runs.length} {g.runs.length === 1 ? "run" : "runs"}
              </span>
              <span className="flex-1 h-px bg-[var(--ao-line-0)]" />
              <span className="font-mono">
                ${g.cost.toFixed(3)} · {formatCompactNumber(g.tokens)}
              </span>
            </div>
            {g.runs.map((r) => {
              const isOpen = openId === r.id;
              return (
                <div key={r.id}>
                  <div
                    className={[
                      "grid gap-[14px] items-center px-[14px] py-[var(--ao-pad-row)] bg-ao-bg-2 border border-ao-line-1 rounded-ao-md mb-[6px] cursor-pointer transition-[background,border-color] duration-[120ms]",
                      "hover:bg-ao-bg-3 hover:border-ao-line-2",
                      isOpen ? "border-[var(--ao-accent-line)] bg-ao-bg-3 !rounded-b-none" : "",
                    ].join(" ")}
                    style={{ gridTemplateColumns: "14px minmax(0, 1fr) auto auto auto auto 16px" }}
                    onClick={() => setOpenId(isOpen ? null : r.id)}
                  >
                    {/* Status dot */}
                    <span
                      className={[
                        "w-[8px] h-[8px] rounded-full",
                        r.status === "done"  ? "bg-ao-ok shadow-[0_0_8px_rgba(78,185,111,0.5)]" :
                        r.status === "error" ? "bg-ao-bad" :
                        "bg-[var(--ao-fg-3)]",
                      ].join(" ")}
                    />
                    {/* Main column */}
                    <div className="min-w-0">
                      <div className="font-semibold text-ao-fg-0 text-[13.5px] flex items-center gap-[8px]">
                        <span>{r.agentName || r.agentId}</span>
                        <span className="font-mono text-[11px] text-ao-fg-2 px-[6px] py-[1px] bg-ao-bg-3 border border-ao-line-1 rounded-[4px]">
                          {r.id.slice(0, 8)}
                        </span>
                      </div>
                      <div className="text-ao-fg-2 text-[12.5px] font-mono whitespace-nowrap overflow-hidden text-ellipsis mt-[2px]">
                        {r.prompt}
                      </div>
                    </div>
                    {/* Cells */}
                    <span className="font-mono text-[12px] text-ao-fg-2 whitespace-nowrap">{formatHistoryDuration(r.durMs)}</span>
                    <span className="font-mono text-[12px] text-ao-fg-1 whitespace-nowrap">
                      {formatCompactNumber(runTokens(r))}
                      <span className="text-ao-fg-2"> tok</span>
                    </span>
                    <span className="font-mono text-[12px] text-ao-fg-1 whitespace-nowrap">${(r.cost || 0).toFixed((r.cost || 0) < 0.1 ? 3 : 2)}</span>
                    <span className="font-mono text-[12px] text-ao-fg-2 whitespace-nowrap">{formatRelativeTime(r.ts)}</span>
                    {/* Chevron */}
                    <span
                      className={[
                        "transition-transform duration-[180ms]",
                        isOpen ? "rotate-180 text-ao-accent" : "text-[var(--ao-fg-3)]",
                      ].join(" ")}
                    >
                      <Icon name="chevron-down" size={14} />
                    </span>
                  </div>
                  {isOpen && (
                    <div
                      className="border border-[var(--ao-accent-line)] border-t-0 rounded-b-ao-md bg-ao-bg-2 p-[14px_16px] mt-[-6px] mb-[6px] grid gap-[14px]"
                      style={{ gridTemplateColumns: "1fr 1fr" }}
                    >
                      {/* Prompt panel */}
                      <div className="bg-ao-bg-1 border border-ao-line-1 rounded-ao-sm overflow-hidden">
                        <div className="px-[12px] py-[8px] border-b border-[var(--ao-line-0)] font-mono text-[11px] text-ao-fg-2 uppercase tracking-[0.08em] flex items-center gap-[8px]">
                          <Icon name="chevron" size={11} /> prompt
                        </div>
                        <div className="px-[12px] py-[10px] font-mono text-[12px] text-ao-fg-0 leading-[1.55] max-h-[160px] overflow-y-auto whitespace-pre-wrap break-words">
                          {r.prompt}
                        </div>
                      </div>
                      {/* Response panel */}
                      <div className="bg-ao-bg-1 border border-ao-line-1 rounded-ao-sm overflow-hidden">
                        <div className="px-[12px] py-[8px] border-b border-[var(--ao-line-0)] font-mono text-[11px] text-ao-fg-2 uppercase tracking-[0.08em] flex items-center gap-[8px]">
                          <Icon name="sparkle" size={11} /> response
                        </div>
                        <div className="px-[12px] py-[10px] font-mono text-[12px] text-ao-fg-0 leading-[1.55] max-h-[160px] overflow-y-auto whitespace-pre-wrap break-words">
                          {r.output || "-"}
                        </div>
                      </div>
                      {/* Meta row */}
                      <div className="col-span-2 flex gap-[18px] flex-wrap pt-[4px] border-t border-dashed border-[var(--ao-line-0)] mt-[-4px]">
                        {[
                          { lbl: "run id",   val: r.id },
                          { lbl: "duration", val: formatHistoryDuration(r.durMs) },
                          { lbl: "tokens",   val: formatCompactNumber(runTokens(r)) },
                          { lbl: "cost",     val: `$${(r.cost || 0).toFixed(4)}` },
                          { lbl: "model",    val: r.model || "-" },
                        ].map(({ lbl, val }) => (
                          <div key={lbl} className="flex flex-col font-mono text-[11px]">
                            <div className="text-ao-fg-2 uppercase tracking-[0.08em] text-[10.5px]">{lbl}</div>
                            <div className="text-ao-fg-0 text-[12px] mt-[2px]">{val}</div>
                          </div>
                        ))}
                        <div className="flex flex-col font-mono text-[11px]">
                          <div className="text-ao-fg-2 uppercase tracking-[0.08em] text-[10.5px]">status</div>
                          <div className="text-ao-fg-0 text-[12px] mt-[2px]">
                            <span className={`inline-flex items-center gap-[5px] py-[3px] px-[9px] rounded-full text-[11px] font-semibold tracking-[0.06em] uppercase font-mono border ${r.status === "done" ? "bg-[var(--ao-ok-soft)] text-[var(--ao-ok)] border-[rgba(78,185,111,0.25)]" : "bg-[var(--ao-bad-soft)] text-[var(--ao-bad)] border-[rgba(217,83,79,0.25)]"}`}>
                              {r.status === "done" ? "completed" : r.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
