"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Project } from "@agent-office/domain/types";
import type { OfficeAgent } from "@/modules/office/hooks/use-office-agents";
import { Icon } from "@/components/ui/icon";
import { PlanetCanvas } from "@/components/ui/planet-canvas";
import { getPlanetParams, planetTag } from "@/lib/planet-seed";
import { ProjectRuntimeBar, ProjectShortcutsBar } from "./project-actions";
import { HeroRoster } from "./project-hero-roster";

export type ProjectHeroProps = {
  project: Project;
  rosterAgentIds: string[];
  workingCount: number;
  allAgents: OfficeAgent[];
  onOpenPlanetEditor: () => void;
  onAddAgent: () => void;
  onSaveDescription: (value: string) => unknown;
  onSaveName: (value: string) => Promise<unknown>;
};

/**
 * The design tints the planet's halo with the planet's own lightest surface
 * colour (its Savanna glow is exactly Savanna's first terrain swatch). Taking
 * the brightest swatch of the first layer keeps that for every palette —
 * including custom ones and black holes, whose first swatch is the near-black core.
 */
function planetGlow(projectId: string, planet: Project["meta"]["planet"]): string {
  const colors = getPlanetParams(projectId, planet).layers[0]?.colors ?? [];
  let best = [0.545, 0.482, 1];
  let bestLum = -1;
  for (let i = 0; i + 2 < colors.length; i += 4) {
    const rgb = [colors[i]!, colors[i + 1]!, colors[i + 2]!];
    const lum = 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
    if (lum > bestLum) { bestLum = lum; best = rgb; }
  }
  const [r, g, b] = best.map((c) => Math.round(c * 255));
  return `rgba(${r},${g},${b},.30)`;
}

/**
 * The cosmic hero card — the page header of the project dashboard. The planet
 * is a backdrop pinned to the card's right edge and vertically centred, so
 * when the Live runs card beside it grows the hero stretches to match and the
 * text column simply re-centres. The text column's max width is measured off
 * the planet's visible edge (not a flat percentage), so buttons wrap before
 * they could ever slide under it; narrow cards shrink, then drop, the planet.
 */
export function ProjectHero({
  project,
  rosterAgentIds,
  workingCount,
  allAgents,
  onOpenPlanetEditor,
  onAddAgent,
  onSaveDescription,
  onSaveName,
}: ProjectHeroProps) {
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState("");
  const tag = planetTag(project.meta.planet);
  const glow = useMemo(() => planetGlow(project.id, project.meta.planet), [project.id, project.meta.planet]);
  const hasCwd = !!project.meta.cwd;

  const submitDesc = (value: string) => {
    setEditingDesc(false);
    if (value.trim() !== project.meta.description) void onSaveDescription(value.trim());
  };

  return (
    <div className="@container flex-[1.62] min-w-[min(100%,500px)] relative overflow-hidden rounded-[24px] surface-sheen shadow-[var(--lift)] px-[28px] py-[26px] flex items-center gap-[28px]">
      <div
        aria-hidden
        className="absolute left-[48%] bottom-[-140px] w-[520px] h-[420px] pointer-events-none"
        style={{ background: "radial-gradient(circle at 50% 50%, rgba(139,123,255,.20), transparent 64%)" }}
      />
      <button
        type="button"
        onClick={onOpenPlanetEditor}
        title="Change planet"
        aria-label="Change planet"
        className="group absolute right-[-130px] top-1/2 -translate-y-1/2 z-0 p-0 border-0 bg-transparent cursor-pointer outline-none @max-[620px]:scale-[.7] @max-[460px]:hidden"
      >
        <span className="relative block animate-[aoDrift_12s_ease-in-out_infinite]">
          <span
            aria-hidden
            className="absolute inset-[-20%] rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle at 48% 44%, ${glow}, transparent 66%)` }}
          />
          <PlanetCanvas projectId={project.id} config={project.meta.planet} size={340} className="relative" />
          <span className="absolute bottom-[58px] right-[156px] w-[30px] h-[30px] rounded-full flex items-center justify-center bg-card-3 border border-edge-2 text-txt-2 shadow-[var(--lift)] transition-colors duration-150 group-hover:text-acc group-focus-visible:text-acc group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-acc">
            <Icon name="edit" size={14} strokeWidth={1.8} />
          </span>
        </span>
      </button>

      <div className="relative z-[1] flex-1 min-w-0 max-w-[calc(100%-198px)] @max-[620px]:max-w-[calc(100%-150px)] @max-[460px]:max-w-none">
        <div className="flex items-center gap-[9px] flex-wrap">
          {workingCount > 0 && (
            <span className="flex items-center gap-[7px] px-[11px] py-[4px] rounded-full bg-green-soft text-green text-[11.5px] font-semibold whitespace-nowrap shrink-0">
              <span className="w-[6px] h-[6px] rounded-full bg-green animate-[aoPulse_1.7s_ease-in-out_infinite]" />
              {workingCount} of {rosterAgentIds.length} working
            </span>
          )}
          {tag && (
            <span className="text-[11.5px] font-semibold px-[10px] py-[4px] rounded-full bg-card-3 text-txt-3 whitespace-nowrap shrink-0">
              {tag}
            </span>
          )}
        </div>

        <TitleField name={project.meta.name} onSave={onSaveName} />

        <AnimatedHeight>
        <DescriptionField
          editing={editingDesc}
          value={editingDesc ? descValue : project.meta.description}
          onEdit={() => {
            setDescValue(project.meta.description);
            setEditingDesc(true);
          }}
          onChange={setDescValue}
          onCommit={submitDesc}
          onCancel={() => setEditingDesc(false)}
        />
        </AnimatedHeight>

        <div className="flex flex-col gap-[11px] mt-[20px]">
          <div className="flex items-center gap-[10px] flex-wrap">
            <button
              type="button"
              onClick={onAddAgent}
              className="flex items-center gap-[8px] px-[18px] py-[11px] rounded-[13px] border-none bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white text-[13.5px] font-bold cursor-pointer whitespace-nowrap shadow-[0_14px_30px_-14px_rgba(139,123,255,0.9)] transition-transform duration-150 hover:-translate-y-[2px]"
            >
              <Icon name="plus" size={15} strokeWidth={2.2} /> Summon agent
            </button>
            <ProjectRuntimeBar projectId={project.id} />
          </div>

          <div className="flex items-center gap-[14px] flex-wrap">
            <ProjectShortcutsBar projectId={project.id} />
            {hasCwd && rosterAgentIds.length > 0 && <span aria-hidden className="w-px h-[20px] bg-edge shrink-0" />}
            <HeroRoster projectId={project.id} projectName={project.meta.name} roster={project.meta.roster} allAgents={allAgents} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DescriptionField({
  editing,
  value,
  onEdit,
  onChange,
  onCommit,
  onCancel,
}: {
  editing: boolean;
  value: string;
  onEdit: () => void;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(ref, editing ? value : null);
  if (editing) {
    return (
      <textarea
        ref={ref}
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onCommit(value);
          }
          if (e.key === "Escape") onCancel();
        }}
        placeholder="What is this project? (Ctrl+Enter to save, Esc to cancel)"
        rows={2}
        className="block w-full mt-[11px] max-w-[380px] px-[10px] py-[8px] rounded-[10px] bg-card-2 border border-edge text-[13.5px] text-txt leading-[1.62] outline-none resize-none overflow-hidden placeholder:text-txt-4 focus:border-acc-line"
      />
    );
  }
  if (value) {
    return (
      <p
        onClick={onEdit}
        title="Click to edit description"
        className="m-0 mt-[11px] max-w-[380px] text-[13.5px] text-txt-2 leading-[1.62] cursor-text transition-colors duration-150 hover:text-txt"
        style={{ textWrap: "pretty" }}
      >
        {value}
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={onEdit}
      className="mt-[11px] inline-flex items-center gap-[6px] px-[12px] py-[6px] rounded-[10px] border border-dashed border-edge-2 bg-card-2 text-txt-3 text-[12px] cursor-pointer transition-colors duration-150 hover:text-txt hover:border-acc-line"
    >
      <Icon name="edit" size={11} /> Add a description
    </button>
  );
}

const TITLE_TEXT = "m-0 mt-[13px] text-[42px] leading-[1.02] tracking-[-0.035em] font-extrabold [overflow-wrap:anywhere]";

// Saves are serialised: each PUT carries the cached `rev`, so two in flight would make the second a stale_write.
function TitleField({ name, onSave }: { name: string; onSave: (value: string) => Promise<unknown> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const original = useRef(name);
  const lastSaved = useRef(name);
  const ref = useRef<HTMLTextAreaElement>(null);
  const save = useSerialSave(onSave);
  useAutoGrow(ref, editing ? draft : null);

  const change = (value: string) => {
    const clean = value.replace(/[\r\n]+/g, " ");
    setDraft(clean);
    const next = clean.trim();
    if (next && next !== lastSaved.current) {
      lastSaved.current = next;
      save(next);
    }
  };
  const finish = () => {
    setEditing(false);
    if (!draft.trim() && lastSaved.current !== original.current) {
      lastSaved.current = original.current;
      save(original.current);
    }
  };

  if (!editing) {
    return (
      <h1
        onClick={() => {
          original.current = name;
          lastSaved.current = name;
          setDraft(name);
          setEditing(true);
        }}
        title="Click to rename"
        className={`${TITLE_TEXT} cursor-text rounded-[8px] transition-colors duration-150 hover:text-txt-2`}
      >
        {name}
      </h1>
    );
  }
  return (
    <textarea
      ref={ref}
      autoFocus
      rows={1}
      maxLength={100}
      value={draft}
      aria-label="Project name"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => change(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          change(original.current);
          e.currentTarget.blur();
        }
      }}
      className={`${TITLE_TEXT} block w-full p-0 bg-transparent border-0 text-txt outline-none resize-none overflow-hidden caret-acc`}
    />
  );
}

function useSerialSave(save: (value: string) => Promise<unknown>) {
  const busy = useRef(false);
  const queued = useRef<string | null>(null);
  return useCallback(
    (value: string) => {
      queued.current = value;
      if (busy.current) return;
      busy.current = true;
      void (async () => {
        while (queued.current !== null) {
          const next = queued.current;
          queued.current = null;
          try {
            await save(next);
          } catch {
            queued.current = null;
          }
        }
        busy.current = false;
      })();
    },
    [save],
  );
}

function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string | null) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || value === null) return;
    el.style.height = "auto";
    const cs = getComputedStyle(el);
    const lineHeight = parseFloat(cs.lineHeight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const borderY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    // scrollHeight includes glyph overflow past the line box; whole lines match the text it replaces.
    const lines = Math.max(1, Math.round((el.scrollHeight - padY) / lineHeight));
    el.style.height = `${lines * lineHeight + padY + borderY}px`;
  }, [ref, value]);
}

function AnimatedHeight({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      className="overflow-hidden transition-[height] duration-[260ms] ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
      style={height === null ? undefined : { height }}
    >
      <div ref={inner} className="flow-root">{children}</div>
    </div>
  );
}
