"use client";

import { useState, useEffect } from "react";
import type React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentMemory, useWriteAgentMemory } from "@/modules/agents/hooks/use-agents";
import { Icon } from "@/components/ui/icon";
import { ACCENT_BTN } from "@/lib/button-styles";
import { parseMemory, serializeMemory, type Fact, type Group } from "@/modules/office/derive/memory-format";

export function MemoryTab({ agentId, discardRef }: { agentId: string; discardRef?: React.MutableRefObject<(() => void) | null> }) {
  const memQ = useAgentMemory(agentId);
  const writeMem = useWriteAgentMemory();
  const [groups, setGroups] = useState<Group[]>([]);
  const [dirty, setDirty] = useState(false);
  const [q, setQ] = useState("");
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (memQ.data !== undefined) {
      setGroups(parseMemory(memQ.data));
      setDirty(false);
    }
  }, [memQ.data]);

  const handleDiscard = () => {
    if (memQ.data !== undefined) {
      setGroups(parseMemory(memQ.data));
      setDirty(false);
    }
  };

  useEffect(() => {
    if (discardRef) discardRef.current = handleDiscard;
  });

  if (memQ.isLoading) {
    return (
      <div className="px-6 pt-5 pb-6 flex-1 flex flex-col">
        <Skeleton width="100%" height={180} />
      </div>
    );
  }

  const totalFacts = groups.reduce((s, g) => s + g.facts.length, 0);

  const updateFact = (gi: number, fi: number, patch: Partial<Fact>) => {
    setGroups((prev) =>
      prev.map((g, i) =>
        i === gi ? { ...g, facts: g.facts.map((f, j) => (j === fi ? { ...f, ...patch } : f)) } : g
      )
    );
    setDirty(true);
  };

  const removeFact = (gi: number, fi: number) => {
    setGroups((prev) =>
      prev.map((g, i) =>
        i === gi ? { ...g, facts: g.facts.filter((_, j) => j !== fi) } : g
      )
    );
    setDirty(true);
  };

  const addFact = (gi: number) => {
    setGroups((prev) =>
      prev.map((g, i) =>
        i === gi ? { ...g, facts: [...g.facts, { id: `new_${Date.now()}`, k: "", v: "" }] } : g
      )
    );
    setDirty(true);
  };

  const removeGroup = (gi: number) => {
    setGroups((prev) => prev.filter((_, i) => i !== gi));
    setDirty(true);
  };

  const addGroup = () => {
    setGroups((prev) => [...prev, { key: `group_${prev.length + 1}`, facts: [] }]);
    setDirty(true);
  };

  const handleSave = async () => {
    await writeMem.mutateAsync({ id: agentId, content: serializeMemory(groups) });
    setDirty(false);
  };

  const matches = (g: Group, f: Fact) => {
    if (!q) return true;
    return `${g.key} ${f.k} ${f.v}`.toLowerCase().includes(q.toLowerCase());
  };

  return (
    <div className="px-6 pt-5 pb-6 flex-1 flex flex-col">
      {/* Header card */}
      <div className="bg-ao-bg-2 border border-ao-line-1 rounded-ao-lg overflow-hidden mb-[14px]">
        <div className="flex items-center gap-[10px] px-[var(--ao-pad-card)] py-[14px] border-b border-[var(--ao-line-0)]">
          <div className="w-[28px] h-[28px] flex items-center justify-center rounded-[8px] bg-ao-bg-3 border border-ao-line-1 text-ao-fg-1 shrink-0"><Icon name="book" size={15} /></div>
          <div>
            <div className="text-[13px] font-semibold tracking-[0.02em] text-ao-fg-0">Memory</div>
            <div className="text-[11.5px] text-ao-fg-2 font-mono mt-[2px]">
              facts carried into every conversation · {totalFacts} facts across {groups.length} groups
            </div>
          </div>
          <div className="ml-auto flex gap-2 items-center">
            <span className="inline-flex items-center gap-[5px] py-[3px] px-[9px] rounded-full text-[11px] font-semibold tracking-[0.06em] uppercase font-mono border bg-[var(--ao-bg-3)] text-[var(--ao-fg-1)] border-[var(--ao-line-1)]">YAML</span>
            <button type="button" className="inline-flex items-center gap-[6px] h-7 px-[10px] rounded-lg bg-ao-bg-3 border border-ao-line-1 text-ao-fg-1 text-[13px] transition-[background,color,border-color] duration-[120ms] hover:bg-ao-bg-4 hover:text-ao-fg-0 hover:border-ao-line-2" onClick={() => setShowRaw(!showRaw)}>
              <Icon name="code" size={13} /> {showRaw ? "Structured" : "View raw"}
            </button>
          </div>
        </div>
      </div>

      {showRaw ? (
        <textarea
          readOnly
          value={memQ.data ?? ""}
          className="w-full min-h-[300px] bg-[var(--ao-bg-2)] text-[var(--ao-fg-1)] border border-[var(--ao-line-1)] rounded-[var(--ao-radius-md)] p-[14px] font-[var(--ao-font-mono)] text-[12.5px] outline-none resize-y"
        />
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-[10px] mb-[14px]">
            <div className="flex-1 flex items-center gap-[10px] px-[14px] py-[9px] bg-ao-bg-2 border border-ao-line-1 rounded-ao-md text-ao-fg-2 focus-within:border-[var(--ao-accent-line)] focus-within:shadow-[0_0_0_3px_var(--ao-accent-softer)]">
              <Icon name="search" size={14} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search facts…"
                className="flex-1 bg-transparent border-0 outline-none text-ao-fg-0 placeholder:text-[var(--ao-fg-3)]"
              />
            </div>
            <button type="button" className="inline-flex items-center gap-[6px] h-7 px-[10px] rounded-lg bg-ao-bg-3 border border-ao-line-1 text-ao-fg-1 text-[13px] transition-[background,color,border-color] duration-[120ms] hover:bg-ao-bg-4 hover:text-ao-fg-0 hover:border-ao-line-2" onClick={addGroup}>
              <Icon name="plus" size={13} /> Add group
            </button>
          </div>

          {/* Groups */}
          {groups.length === 0 ? (
            <div className="bg-ao-bg-2 border border-ao-line-1 rounded-ao-lg overflow-hidden">
              <div className="flex flex-col items-center text-center gap-4 px-[28px] py-[48px]">
                <div className="shrink-0 flex items-center justify-center w-[50px] h-[50px] rounded-full bg-ao-bg-3 border border-ao-line-1 text-ao-accent">
                  <Icon name="book" size={24} />
                </div>
                <div className="flex flex-col items-center gap-[6px]">
                  <div className="text-[15px] font-semibold text-ao-fg-0">Give this agent a memory</div>
                  <div className="text-[13px] text-ao-fg-2 max-w-[380px] leading-relaxed">
                    Group facts the agent should always know — like conventions, key paths, or people — so it starts every run with the right context.
                  </div>
                </div>
                <button type="button" className={`inline-flex items-center gap-[6px] h-8 px-[14px] rounded-[9px] text-[13px] font-semibold cursor-pointer mt-1 ${ACCENT_BTN}`} onClick={addGroup}>
                  <Icon name="plus" size={13} /> Add first group
                </button>
              </div>
            </div>
          ) : (
            groups.map((g, gi) => {
              const visible = g.facts.filter((f) => matches(g, f));
              if (q && visible.length === 0) return null;
              return (
                <div key={`${g.key}_${gi}`} className="bg-ao-bg-2 border border-ao-line-1 rounded-ao-lg overflow-hidden mb-[12px]">
                  {/* Section header */}
                  <div className="flex items-center gap-[10px] px-[14px] py-[10px] bg-ao-bg-2 border-b border-[var(--ao-line-0)]">
                    <span className="font-mono text-[12.5px] font-semibold text-ao-accent lowercase">{g.key}:</span>
                    <span className="text-ao-fg-2 font-mono text-[11px]">{g.facts.length} {g.facts.length === 1 ? "fact" : "facts"}</span>
                    <div className="ml-auto flex gap-[4px]">
                      <button
                        type="button"
                        aria-label="Delete group"
                        onClick={() => removeGroup(gi)}
                        className="w-[26px] h-[26px] flex items-center justify-center rounded-[6px] text-ao-fg-2 hover:bg-ao-bg-3 hover:text-ao-bad"
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  </div>
                  {visible.map((f) => {
                    const fi = g.facts.indexOf(f);
                    return (
                      <div
                        key={f.id}
                        className="group/fact grid gap-[12px] items-center px-[14px] py-[10px] border-t border-[var(--ao-line-0)] first:border-t-0"
                        style={{ gridTemplateColumns: "180px 1fr auto" }}
                      >
                        <div className="font-mono text-[12.5px] text-ao-fg-2 whitespace-nowrap overflow-hidden text-ellipsis">
                          <input
                            value={f.k}
                            placeholder="key"
                            onChange={(e) => updateFact(gi, fi, { k: e.target.value })}
                            className="bg-transparent border-0 outline-none w-full text-[var(--ao-fg-2)] font-[var(--ao-font-mono)] text-[12.5px]"
                          />
                        </div>
                        <div className="text-ao-fg-0 text-[13.5px]">
                          <input
                            value={f.v}
                            placeholder="value"
                            onChange={(e) => updateFact(gi, fi, { v: e.target.value })}
                            className="bg-transparent border-0 outline-none w-full text-ao-fg-0 text-[13.5px] py-[4px] focus:border-b focus:border-[var(--ao-accent-line)]"
                          />
                        </div>
                        <div className="flex gap-[4px] opacity-0 group-hover/fact:opacity-100 transition-opacity duration-[140ms]">
                          <button
                            type="button"
                            aria-label="Delete"
                            onClick={() => removeFact(gi, fi)}
                            className="w-[26px] h-[26px] flex items-center justify-center rounded-[6px] text-[var(--ao-fg-3)] hover:bg-ao-bg-3 hover:text-ao-bad"
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="flex items-center gap-[8px] px-[14px] py-[10px] border-t border-dashed border-[var(--ao-line-0)] text-ao-fg-2 text-[13px] font-mono w-full hover:bg-ao-bg-3 hover:text-ao-fg-0"
                    onClick={() => addFact(gi)}
                  >
                    <Icon name="plus" size={13} /> add fact to {g.key}
                  </button>
                </div>
              );
            })
          )}
        </>
      )}

      {/* Save bar */}
      {dirty && (
        <div className="sticky bottom-0 flex items-center gap-3 px-6 py-[14px] bg-[linear-gradient(180deg,transparent,var(--ao-bg-1)_30%)] border-t border-ao-line-1 mt-4 -mx-6 -mb-6 shrink-0">
          <span className="inline-flex items-center gap-2 font-mono text-[12px] text-[var(--ao-warn)]">
            <span className="w-[6px] h-[6px] rounded-full bg-[var(--ao-warn)] shadow-[0_0_8px_var(--ao-warn)] animate-[ao-pulse_1.6s_infinite]" /> Unsaved changes
          </span>
          <span className="text-ao-fg-2 font-mono text-[11.5px]">~/.claude/agents/{agentId}.memory.yaml</span>
          <div className="ml-auto flex gap-2">
            <button type="button" className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium bg-transparent border-transparent text-ao-fg-1 hover:bg-ao-bg-3 hover:text-ao-fg-0 disabled:opacity-50" onClick={handleDiscard}>
              Discard
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium bg-[var(--ao-accent)] border border-transparent text-white hover:bg-[color-mix(in_oklab,var(--ao-accent)_90%,white)] disabled:opacity-50"
              onClick={handleSave}
              disabled={writeMem.isPending}
            >
              <Icon name="check" size={13} /> Save memory
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
