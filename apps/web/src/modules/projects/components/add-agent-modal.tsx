"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
import { formatAgentDisplayName } from "@/lib/agent-display-name";
import { useOfficeStore } from "@/modules/office/hooks/use-office-store";
import { useAgents } from "@/modules/agents/hooks/use-agents";
import { categorize } from "@/modules/agents/form/categorize";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import { useAddInstance, useProject, useProjects } from "../hooks/use-projects";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type AddAgentModalProps = {
  open: boolean;
  projectId: string | null;
  onClose: () => void;
  onProjectChange?: (id: string) => void;
};

/* ── Category metadata ─────────────────────────────────────────── */

/**
 * `fg` is the chip's label colour on a *dark* surface — each one is a
 * lightened tint of `color`. On the light theme those same values sit on a
 * 10%-alpha wash of themselves over white and measure 1.4-1.9:1, i.e. all but
 * invisible. `fgLight` is the mirror-image darkened tint for that case; the
 * `.cat-chip` rule in globals.css picks whichever matches the active theme.
 */
const CAT_META: Record<string, { color: string; bg: string; border: string; fg: string; fgLight: string }> = {
  Engineering: { color: "#2A6FDB", bg: "rgba(42,111,219,0.10)",   border: "rgba(42,111,219,0.30)",   fg: "#74a8f0", fgLight: "#1a54ad" },
  QA:          { color: "#4eb96f", bg: "rgba(78,185,111,0.10)",   border: "rgba(78,185,111,0.30)",   fg: "#80d29c", fgLight: "#27703f" },
  Design:      { color: "#ec4899", bg: "rgba(236,72,153,0.10)",   border: "rgba(236,72,153,0.30)",   fg: "#f09ec4", fgLight: "#a81f5f" },
  "AI & Data": { color: "#8b5cf6", bg: "rgba(139,92,246,0.10)",   border: "rgba(139,92,246,0.30)",   fg: "#b39dfa", fgLight: "#6532cc" },
  Security:    { color: "#ef4444", bg: "rgba(239,68,68,0.10)",    border: "rgba(239,68,68,0.30)",    fg: "#f48080", fgLight: "#b91c1c" },
  Docs:        { color: "#f59e0b", bg: "rgba(245,158,11,0.10)",   border: "rgba(245,158,11,0.30)",   fg: "#fbbf55", fgLight: "#875106" },
  Marketing:   { color: "#f97316", bg: "rgba(249,115,22,0.10)",   border: "rgba(249,115,22,0.30)",   fg: "#fb9a55", fgLight: "#a8460c" },
  Research:    { color: "#06b6d4", bg: "rgba(6,182,212,0.10)",    border: "rgba(6,182,212,0.30)",    fg: "#4fd9ea", fgLight: "#0b6b82" },
  Strategy:    { color: "#8b5cf6", bg: "rgba(139,92,246,0.10)",   border: "rgba(139,92,246,0.30)",   fg: "#b39dfa", fgLight: "#6532cc" },
  Build:       { color: "#e95420", bg: "rgba(233,84,32,0.10)",    border: "rgba(233,84,32,0.30)",    fg: "#f07a52", fgLight: "#9c3410" },
  Other:       { color: "#9b9089", bg: "rgba(155,144,137,0.08)",  border: "rgba(155,144,137,0.30)",  fg: "#cdc4bd", fgLight: "#5a534e" },
};

function catStyle(cat: string): React.CSSProperties {
  const c = CAT_META[cat] ?? CAT_META.Other!;
  return {
    "--cat-color": c.color,
    "--cat-bg": c.bg,
    "--cat-border": c.border,
    "--cat-fg": c.fg,
    "--cat-fg-light": c.fgLight,
  } as React.CSSProperties;
}

function modelColor(m: string | undefined): string {
  if (!m) return "var(--txt-4)";
  if (m.includes("haiku"))  return "var(--working)";
  if (m.includes("opus"))   return "#ffcb6b";
  return "#c792ea";
}

/* ── Main modal ─────────────────────────────────────────────────── */

export function AddAgentModal({ open, projectId, onClose, onProjectChange }: AddAgentModalProps) {
  const [targetId, setTargetId] = useState<string | null>(projectId);
  const projectsQ = useProjects();
  const projects = projectsQ.data;
  const autoPickedRef = useRef(false);

  useEffect(() => {
    if (open) { setTargetId(projectId); autoPickedRef.current = false; }
  }, [open, projectId]);

  useEffect(() => {
    if (!open || targetId || autoPickedRef.current) return;
    if (!projects || projects.length !== 1) return;
    const only = projects[0]!.id;
    autoPickedRef.current = true;
    setTargetId(only);
    onProjectChange?.(only);
  }, [open, targetId, projects, onProjectChange]);

  const handleClose = () => { setTargetId(projectId); onClose(); };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleClose is stable within an open cycle
  }, [open]);

  if (!open) return null;

  const content = (
    <div className="app-modal-backdrop fixed inset-0 flex items-center justify-center bg-[rgba(5,5,10,0.78)] z-[200] after:content-[''] after:absolute after:inset-0 after:[backdrop-filter:blur(10px)] after:[-webkit-backdrop-filter:blur(10px)] after:pointer-events-none" style={{ top: 74, padding: 8 }} onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="relative bg-bg-1 border border-line flex flex-col overflow-hidden [width:min(820px,100%)] rounded-[8px] [box-shadow:0_32px_64px_-12px_rgba(0,0,0,0.7)] z-[1]" style={{ maxHeight: "calc(100vh - 90px)" }} role="dialog" aria-modal="true">
        {targetId ? (
          <AgentPickerStep
            projectId={targetId}
            onChangeProject={() => setTargetId(null)}
            onClose={handleClose}
          />
        ) : (
          <ProjectPickerStep
            onPick={(id) => { setTargetId(id); onProjectChange?.(id); }}
            onClose={handleClose}
          />
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

/* ── Project picker step ────────────────────────────────────────── */

function ProjectPickerStep({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const projectsQ = useProjects();
  const projects = useMemo(() => projectsQ.data ?? [], [projectsQ.data]);

  return (
    <>
      <div className="flex items-center border-b border-line shrink-0 px-[22px] py-[18px] gap-[12px]">
        <div className="flex items-center justify-center bg-acc-faint text-acc shrink-0 w-[34px] h-[34px] rounded-[9px] border border-[var(--acc-tint)]"><Icon name="folder" size={15} /></div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-txt text-[16px]">Choose a project</div>
          <div className="text-txt-3 flex items-center font-[var(--font-mono)] text-[11.5px] mt-[2px] gap-[6px]">Select which project to add agents to</div>
        </div>
        <button type="button" className="flex items-center justify-center text-txt-3 bg-transparent border-none cursor-pointer shrink-0 w-[32px] h-[32px] rounded-[8px] hover:bg-bg-3 hover:text-txt" onClick={onClose} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-[22px] py-4">
        {projectsQ.isLoading ? (
          <Skeleton width="100%" height={120} />
        ) : projects.length === 0 ? (
          <div className="p-6 text-center text-txt-3 text-[13px]">
            <p className="mb-3">No projects configured yet.</p>
            <Button href={PAGE_ROUTES.settings} variant="primary" onClick={onClose}>
              Configure root directory
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p.id)}
                className="grid gap-3 items-center p-[10px_14px] bg-bg-2 border border-line rounded-[10px] cursor-pointer text-left text-txt font-[inherit]"
                style={{ gridTemplateColumns: "auto 1fr auto" }}
              >
                <Icon name="folder" size={16} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{p.name}</div>
                  {p.cwd && (
                    <div className="font-mono text-[11px] text-txt-3 overflow-hidden text-ellipsis whitespace-nowrap">
                      {p.cwd}
                    </div>
                  )}
                </div>
                <span className="font-mono text-[11px] text-txt-3">
                  {p.instanceCount} agent{p.instanceCount !== 1 ? "s" : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ── Agent picker step ──────────────────────────────────────────── */

function AgentPickerStep({
  projectId,
  onChangeProject,
  onClose,
}: {
  projectId: string;
  onChangeProject: () => void;
  onClose: () => void;
}) {
  const projectQ = useProject(projectId);
  const agentsQ = useAgents();
  const addMut = useAddInstance();

  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [view, setView] = useState<"all" | "available">("all");
  const [staged, setStaged] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const selectAgent = useOfficeStore((s) => s.select);
  const openDetails = (agentId: string) => selectAgent(agentId, { tab: "settings" });

  const agents = useMemo(() => agentsQ.data ?? [], [agentsQ.data]);

  const rosterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const inst of projectQ.data?.meta.roster ?? []) {
      counts[inst.agentId] = (counts[inst.agentId] ?? 0) + 1;
    }
    return counts;
  }, [projectQ.data]);

  // All unique categories present in the agent list
  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const a of agents) seen.add(categorize(a));
    return [
      { id: "all", label: "All", color: null, count: agents.length },
      ...Array.from(seen).map((cat) => ({
        id: cat, label: cat, color: CAT_META[cat]?.color ?? null,
        count: agents.filter((a) => categorize(a) === cat).length,
      })).sort((a, b) => b.count - a.count),
    ];
  }, [agents]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return agents.filter((a) => {
      if (catFilter !== "all" && categorize(a) !== catFilter) return false;
      if (view === "available" && rosterCounts[a.name]) return false;
      if (!ql) return true;
      const blob = `${a.name} ${a.description ?? ""} ${(a.skills ?? []).join(" ")} ${(a.tools ?? []).join(" ")}`.toLowerCase();
      return blob.includes(ql);
    });
  }, [agents, q, catFilter, view, rosterCounts]);

  const inRoster = filtered.filter((a) => rosterCounts[a.name]);
  const notInRoster = filtered.filter((a) => !rosterCounts[a.name]);

  const totalStaged = Object.values(staged).reduce((s, n) => s + n, 0);
  const stagedEntries = Object.entries(staged).map(([id, n]) => ({ agent: agents.find((a) => a.name === id), n })).filter((x) => x.agent);

  const handleSummon = useCallback(async () => {
    if (totalStaged === 0) { onClose(); return; }
    setError(null);
    const entries = Object.entries(staged);
    try {
      for (const [agentId, count] of entries) {
        for (let i = 0; i < count; i++) {
          await new Promise<void>((resolve, reject) => {
            addMut.mutate({ projectId, agentId }, { onSuccess: () => resolve(), onError: reject });
          });
        }
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [staged, projectId, addMut, onClose, totalStaged]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); handleSummon(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleSummon]);

  const projectLabel = projectQ.data?.meta.name ?? projectId;

  return (
    <>
      <div className="flex items-center border-b border-line shrink-0 px-[22px] py-[18px] gap-[12px]">
        <div className="flex items-center justify-center text-acc shrink-0"><Icon name="plus" size={32} /></div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-txt text-[16px]">Add agent to office</div>
          <div className="text-txt-3 flex items-center font-[var(--font-mono)] text-[11.5px] mt-[2px] gap-[6px]">
            Adding to <span className="text-txt-2 font-semibold">{projectLabel}</span>
            <span className="text-txt-4">·</span>
            <button type="button" className="text-acc no-underline cursor-pointer bg-transparent border-none font-[inherit] p-0 hover:underline" onClick={onChangeProject}>Change project</button>
            <span className="text-txt-4">·</span>
            <span>click to stage, summon to commit</span>
          </div>
        </div>
        <button type="button" className="flex items-center justify-center text-txt-3 bg-transparent border-none cursor-pointer shrink-0 w-[32px] h-[32px] rounded-[8px] hover:bg-bg-3 hover:text-txt" onClick={onClose} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
      </div>

      <div className="flex items-center shrink-0 gap-[10px] px-[22px] pt-[14px] pb-[8px]">
        <div className="flex-1 flex items-center bg-bg-2 border border-line text-txt-3 gap-[10px] px-[12px] py-[9px] rounded-[9px] transition-[border-color,box-shadow] duration-[120ms] focus-within:border-[var(--acc-tint)] focus-within:[box-shadow:0_0_0_3px_var(--acc-faint)]">
          <Icon name="search" size={13} />
          <input
            className="flex-1 bg-transparent border-0 outline-none text-txt text-[13px] font-[inherit]"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by name, description, or skill…"
          />
        </div>
        <div className="inline-flex bg-bg-2 border border-line p-[3px] rounded-[8px]">
          <button type="button" className={`aa-seg-btn text-txt-3 bg-transparent border-none cursor-pointer px-[10px] py-[5px] rounded-[5px] text-[12px] font-[var(--font-mono)] transition-[background,color] duration-[100ms]${view === "all" ? " bg-bg-3 text-txt [box-shadow:inset_0_0_0_1px_var(--line)]" : ""}`} onClick={() => setView("all")}>All</button>
          <button type="button" className={`aa-seg-btn text-txt-3 bg-transparent border-none cursor-pointer px-[10px] py-[5px] rounded-[5px] text-[12px] font-[var(--font-mono)] transition-[background,color] duration-[100ms]${view === "available" ? " bg-bg-3 text-txt [box-shadow:inset_0_0_0_1px_var(--line)]" : ""}`} onClick={() => setView("available")}>Not in office</button>
        </div>
      </div>

      <div className="flex flex-wrap shrink-0 gap-[6px] px-[22px] pb-[12px]">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`aa-cat inline-flex items-center bg-bg-2 border border-line rounded-full text-txt-3 cursor-pointer gap-[6px] px-[11px] py-[5px] text-[11.5px] font-[inherit] transition-[border-color,color] duration-[100ms] hover:text-txt hover:border-line-2${catFilter === c.id ? " bg-acc-faint text-acc border-[var(--acc-tint)]" : ""}`}
            onClick={() => setCatFilter(c.id)}
          >
            {c.color && <span className="rounded-full shrink-0 w-[6px] h-[6px]" style={{ background: c.color }} />}
            {c.label}
            <span className={`rounded-full font-[var(--font-mono)] text-[10px] px-[5px] py-0${catFilter === c.id ? " text-acc bg-[rgba(255,255,255,0.06)] border border-[var(--acc-tint)]" : " bg-bg-3 border border-line text-txt-2"}`}>{c.count}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-[22px] py-[4px] pb-[8px]">
        {error && (
          <div className="mb-[10px] text-status-error text-xs font-mono px-3 py-2 rounded-md bg-[color-mix(in_oklch,var(--error)_12%,transparent)]">
            {error}
          </div>
        )}
        {agentsQ.isLoading ? (
          <Skeleton width="100%" height={200} />
        ) : filtered.length === 0 ? (
          <div className="text-center text-txt-3 flex flex-col items-center px-[20px] py-[50px]">
            <div className="flex items-center justify-center bg-bg-3 border border-line text-txt-4 w-[50px] h-[50px] rounded-[12px] mx-auto mb-[14px]"><Icon name="search" size={20} /></div>
            <div className="text-sm text-txt-2">
              {q ? `No agents match "${q}"` : "No agents in this category"}
            </div>
          </div>
        ) : (
          <>
            {view === "all" && notInRoster.length > 0 && (
              <>
                <div className="flex items-center uppercase text-txt-4 gap-[10px] px-[4px] pt-[12px] pb-[8px] font-[var(--font-mono)] text-[10.5px] tracking-[0.1em]">
                  <span className="text-txt-3 font-semibold">Available</span>
                  <span className="bg-bg-3 border border-line text-txt-2 rounded-full normal-case font-normal px-[7px] py-[1px] tracking-[0] text-[10px]">{notInRoster.length}</span>
                  <span className="flex-1 h-[1px] bg-[var(--line)]" />
                </div>
                {notInRoster.map((a) => (
                  <AgentRow
                    key={a.name}
                    name={a.name}
                    description={a.description}
                    defaultModel={a.defaultModel}
                    unit={a.unit}
                    category={categorize(a)}
                    rosterCount={rosterCounts[a.name] ?? 0}
                    stagedCount={staged[a.name] ?? 0}
                    onAdd={() => setStaged((prev) => ({ ...prev, [a.name]: (prev[a.name] ?? 0) + 1 }))}
                    onRemove={() => setStaged((prev) => { const n = (prev[a.name] ?? 0) - 1; if (n <= 0) { const next = { ...prev }; delete next[a.name]; return next; } return { ...prev, [a.name]: n }; })}
                    onDetails={() => openDetails(a.name)}
                  />
                ))}
              </>
            )}
            {view === "all" && inRoster.length > 0 && (
              <>
                <div className="flex items-center uppercase text-txt-4 gap-[10px] px-[4px] pt-[12px] pb-[8px] font-[var(--font-mono)] text-[10.5px] tracking-[0.1em]">
                  <span className="text-txt-3 font-semibold">Already in office</span>
                  <span className="bg-bg-3 border border-line text-txt-2 rounded-full normal-case font-normal px-[7px] py-[1px] tracking-[0] text-[10px]">{inRoster.length}</span>
                  <span className="flex-1 h-[1px] bg-[var(--line)]" />
                </div>
                {inRoster.map((a) => (
                  <AgentRow
                    key={a.name}
                    name={a.name}
                    description={a.description}
                    defaultModel={a.defaultModel}
                    unit={a.unit}
                    category={categorize(a)}
                    rosterCount={rosterCounts[a.name] ?? 0}
                    stagedCount={staged[a.name] ?? 0}
                    onAdd={() => setStaged((prev) => ({ ...prev, [a.name]: (prev[a.name] ?? 0) + 1 }))}
                    onRemove={() => setStaged((prev) => { const n = (prev[a.name] ?? 0) - 1; if (n <= 0) { const next = { ...prev }; delete next[a.name]; return next; } return { ...prev, [a.name]: n }; })}
                    onDetails={() => openDetails(a.name)}
                  />
                ))}
              </>
            )}
            {view === "available" && notInRoster.map((a) => (
              <AgentRow
                key={a.name}
                name={a.name}
                description={a.description}
                defaultModel={a.defaultModel}
                unit={a.unit}
                category={categorize(a)}
                rosterCount={0}
                stagedCount={staged[a.name] ?? 0}
                onAdd={() => setStaged((prev) => ({ ...prev, [a.name]: (prev[a.name] ?? 0) + 1 }))}
                onRemove={() => setStaged((prev) => { const n = (prev[a.name] ?? 0) - 1; if (n <= 0) { const next = { ...prev }; delete next[a.name]; return next; } return { ...prev, [a.name]: n }; })}
                onDetails={() => openDetails(a.name)}
              />
            ))}
          </>
        )}
      </div>

      <div className="flex items-center border-t border-line bg-bg-2 shrink-0 gap-[14px] px-[22px] py-[12px]">
        <div className="flex items-center flex-1 min-w-0 gap-[12px]">
          {stagedEntries.length === 0 ? (
            <div className="font-[var(--font-mono)] text-[12px] text-txt-2"><span className="text-txt-4">No agents staged yet</span></div>
          ) : (
            <>
              <div className="flex">
                {stagedEntries.slice(0, 5).map(({ agent }) => (
                  <div key={agent!.name} className="flex items-center justify-center bg-bg-3 border border-line overflow-hidden w-[26px] h-[26px] rounded-[7px] -ml-[6px] first:ml-0 [box-shadow:0_0_0_2px_var(--bg-2)]" title={agent!.name}>
                    <AgentAvatar unit={unitForAgent(agent!.name, agent!.unit)} size={22} />
                  </div>
                ))}
                {stagedEntries.length > 5 && <div className="flex items-center justify-center bg-bg-1 border border-line text-txt-3 -ml-[6px] [box-shadow:0_0_0_2px_var(--bg-2)] w-[26px] h-[26px] rounded-[7px] font-[var(--font-mono)] text-[11px]">+{stagedEntries.length - 5}</div>}
              </div>
              <div className="font-[var(--font-mono)] text-[12px] text-txt-2">
                <span className="text-txt font-semibold">{totalStaged}</span> agent{totalStaged !== 1 ? "s" : ""} to summon
                {totalStaged !== stagedEntries.length && (
                  <span className="text-txt-4"> · {stagedEntries.length} distinct</span>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex gap-[8px]">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <button
            type="button"
            /* cn()/twMerge, not string concat: the idle branch adds
               `text-txt-3` while `text-white` is still in the base list, and
               raw concatenation leaves both in the class attribute. Which one
               wins is then down to stylesheet order — in practice `text-white`
               did, giving white-on-#e3e5e8 (1.26:1) for the idle "Done" label
               and its ⌘↵ hint. twMerge drops the loser outright. */
            className={cn(
              "aa-btn-done inline-flex items-center bg-acc text-white font-semibold border-none cursor-pointer gap-[6px] px-[16px] py-[8px] rounded-[8px] text-[13px] font-[inherit]",
              totalStaged === 0 && "bg-bg-3 text-txt-2 cursor-default",
            )}
            onClick={handleSummon}
            disabled={addMut.isPending}
          >
            <Icon name="check" size={12} />
            {addMut.isPending ? "Adding…" : totalStaged === 0 ? "Done" : `Summon ${totalStaged}`}
            <span className="inline-block bg-[rgba(255,255,255,0.18)] ml-[4px] font-[var(--font-mono)] text-[9.5px] px-[5px] py-[1px] rounded-[3px]">⌘ ↵</span>
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Agent row ──────────────────────────────────────────────────── */

function AgentRow({
  name, description, defaultModel, unit, category,
  rosterCount, stagedCount, onAdd, onRemove, onDetails,
}: {
  name: string;
  description?: string | null;
  defaultModel?: string | null;
  unit?: string | null;
  category: string;
  rosterCount: number;
  stagedCount: number;
  onAdd: () => void;
  onRemove: () => void;
  onDetails: () => void;
}) {
  const inOffice = rosterCount > 0;
  const added = stagedCount > 0 || inOffice;
  const unitSel = unitForAgent(name, unit);

  return (
    <div
      className={`grid items-center border gap-[14px] px-[14px] py-[12px] rounded-[12px] mb-[6px] transition-[background,border-color] duration-[120ms] hover:bg-bg-3 hover:border-line-2${added ? " border-[rgba(34,197,94,0.30)] [background:linear-gradient(90deg,rgba(34,197,94,0.05),transparent_60%)]" : " bg-bg-2 border-line"}`}
      style={{ ...catStyle(category), gridTemplateColumns: "44px minmax(0,1fr) auto" }}
    >
      <div className={`flex items-center justify-center bg-bg-3 relative overflow-hidden shrink-0 w-[44px] h-[44px] rounded-[11px] border before:content-[''] before:absolute before:inset-0 before:[background:radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.08),transparent_60%)] before:pointer-events-none${added ? " border-[rgba(34,197,94,0.35)]" : " border-line"}`}>
        <AgentAvatar unit={unitSel} size={36} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center flex-wrap gap-[7px]">
          <span className="font-bold text-txt text-[14.5px]">{formatAgentDisplayName(name)}</span>
          <span className="text-txt-4 font-[var(--font-mono)] text-[10.5px]">{name}</span>
          {defaultModel && (
            <span className="inline-flex items-center bg-bg-1 border border-line text-txt-2 gap-[5px] px-[6px] pr-[7px] py-[2px] rounded-[5px] font-[var(--font-mono)] text-[10.5px]">
              <span className="rounded-full shrink-0 w-[4px] h-[4px]" style={{ background: modelColor(defaultModel) }} />
              {defaultModel.replace("claude-", "").replace(/-\d+(-\d+)?$/, "")}
            </span>
          )}
          {/* `color` deliberately lives in the .cat-chip CSS rule, not here:
              an inline style would outrank the light-theme override. */}
          <span className="cat-chip inline-flex items-center border font-semibold gap-[4px] px-[8px] py-[2px] rounded-[5px] font-[var(--font-mono)] text-[10.5px] tracking-[0.03em]" style={{ background: "var(--cat-bg,var(--bg-3))", borderColor: "var(--cat-border,var(--line))" }}>
            <span className="rounded-full shrink-0 w-[5px] h-[5px]" style={{ background: "var(--cat-color)" }} />
            {category.toLowerCase()}
          </span>
        </div>
        {description && <div className="text-txt-3 overflow-hidden mt-[4px] text-[12.5px] leading-[1.5] line-clamp-2">{description}</div>}
        {inOffice && (
          <div className="inline-flex items-center text-txt-4 mt-[5px] font-[var(--font-mono)] text-[11px] gap-[6px]">
            <span className="inline-flex items-center rounded-full bg-[rgba(34,197,94,0.10)] border border-[rgba(34,197,94,0.30)] text-[var(--working)] px-[6px] py-[1px] gap-[3px]"><Icon name="check" size={9} /> in office</span>
            <span>· already summoned {rosterCount}×</span>
          </div>
        )}
      </div>
      <div className="flex items-center shrink-0 gap-[4px]">
        <button
          type="button"
          className="inline-flex items-center justify-center shrink-0 w-[34px] h-[34px] rounded-[8px] border bg-transparent border-line text-txt-3 transition-[background,color] duration-[120ms] hover:bg-bg-3 hover:text-txt hover:border-line-2"
          onClick={onDetails}
          title="View agent details"
          aria-label="View agent details"
        >
          <Icon name="help-circle" size={14} />
        </button>
        {added ? (
          <div className="inline-flex items-center gap-[4px]">
            {stagedCount > 0 && (
              <button
                type="button"
                className="inline-flex items-center justify-center shrink-0 w-[30px] h-[34px] rounded-[8px] border bg-[rgba(34,197,94,0.10)] border-[rgba(34,197,94,0.30)] text-[var(--working)] transition-[background,border-color] duration-[120ms] hover:bg-[rgba(239,68,68,0.12)] hover:border-[rgba(239,68,68,0.35)] hover:text-status-error"
                onClick={onRemove}
                aria-label="Remove one"
              >
                <Icon name="minus" size={12} />
              </button>
            )}
            <button
              type="button"
              className="inline-flex items-center font-semibold whitespace-nowrap cursor-pointer shrink-0 gap-[6px] py-[8px] pl-[10px] pr-[14px] rounded-[8px] text-[12.5px] transition-[background,border-color,color] duration-[120ms] font-[inherit] border bg-[rgba(34,197,94,0.10)] border-[rgba(34,197,94,0.30)] text-[var(--working)] hover:bg-[rgba(34,197,94,0.18)] hover:border-[rgba(34,197,94,0.45)]"
              onClick={onAdd}
            >
              <Icon name="check" size={12} /> Added
              <span className="rounded-full text-white inline-flex items-center justify-center bg-[var(--working)] px-[6px] font-[var(--font-mono)] text-[10px] min-w-[18px] h-[18px]">{inOffice ? rosterCount + stagedCount : stagedCount}</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="inline-flex items-center font-semibold whitespace-nowrap cursor-pointer shrink-0 gap-[6px] py-[8px] px-[14px] rounded-[8px] text-[12.5px] transition-[background,border-color,color] duration-[120ms] font-[inherit] border bg-bg-3 border-line text-txt-2 hover:bg-acc hover:text-white hover:border-[var(--acc)]"
            onClick={onAdd}
          >
            <Icon name="plus" size={12} /> Add
          </button>
        )}
      </div>
    </div>
  );
}
