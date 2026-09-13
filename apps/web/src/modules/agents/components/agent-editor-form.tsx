"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UnitSprite } from "@/components/ui/unit-sprite";
import { WeaponIcon } from "@/components/ui/weapon-icon";
import { Icon, type IconName } from "@/components/ui/icon";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import {
  EMPTY_FORM,
  type AgentFormValues,
  type FormError,
  slugifyId,
  toBody,
  validateForm,
  parseCsv,
  toCsv,
} from "../form/agent-form";
import { useCreateAgent, useWriteAgent, useDeleteAgent } from "../hooks/use-agents";
import { useInstalledSkills, useSkillIcons, skillIconKey, skillIconConfig } from "@/modules/skills/hooks/use-skills";
import type { IconConfig } from "@agent-office/pixel-icons";
import { Button } from "@/components/ui/button";
import { CodeEditor } from "@/components/ui/code-editor";
import { DocsRender } from "@/modules/docs/docs-render";
import { EFFORT_OPTS, PERMISSION_MODE_OPTS } from "@agent-office/domain/config/agent-opts";
import { MODEL_CATALOG, MODEL_IDS, formatModelPrice } from "@agent-office/domain/config/models";
import {
  UNIT_FACTIONS,
  UNIT_KINDS,
  UNIT_DEFS,
  FACTION_LABELS,
  formatUnit,
  unitForAgent,
  type UnitFaction,
} from "@/components/ui/unit-sprite-registry";
import { categoryColor } from "../form/categorize";
import { cn } from "@/lib/cn";

/**
 * Single source of truth for "edit an agent's definition" — used by
 * `/agents/new`, `/agents/[id]/edit`, and the Customization tab inside the
 * agent conversation modal. Previously each of those three call sites had
 * its own bespoke, independently-drifting implementation; this component
 * replaces all three (see `agent-form.tsx` and `settings-tab.tsx`, both
 * deleted alongside this file landing).
 *
 * `mode="new"` renders the create flow (id auto-slugs from name, no delete).
 * `mode="edit"` locks the id, adds a Delete action, and diffs "dirty" state
 * against the loaded agent instead of the empty defaults.
 *
 * `embedded` drops the full-page header/breadcrumb and the absolute
 * viewport-pinned save bar in favor of a `sticky` bar that fits inside a
 * modal tab's own scroll container (used by the Customization tab).
 *
 * Visual language matches the "Forge Agent V3" mockup: sheen-bordered cards,
 * a big animated unit sprite standing on the live-preview stage, gradient
 * accent treatments for the active choice in every picker, and procedurally
 * painted pixel-weapon icons (see `weapon-icon.tsx`) for equipped skills.
 */

const TOOL_SUGGESTIONS = [
  { id: "Read",      desc: "Read files" },
  { id: "Write",     desc: "Write files" },
  { id: "Edit",      desc: "Edit files" },
  { id: "Bash",      desc: "Run shell" },
  { id: "Grep",      desc: "Search code" },
  { id: "Glob",      desc: "Find files" },
  { id: "WebFetch",  desc: "Fetch URLs" },
  { id: "TodoWrite", desc: "Task list" },
  { id: "Task",      desc: "Spawn agents" },
];

// Model picker data (id, name, full versioned id, tier badge, icon, price,
// description) all come from the one shared MODEL_CATALOG (config/models.ts)
// — this used to be its own hand-typed table that could (and did: Haiku's
// price here was stale) drift from the pricing used elsewhere in the app.
const MODELS = MODEL_IDS.map((id) => {
  const info = MODEL_CATALOG[id];
  return {
    id, name: id, full: info.fullId, badge: info.tier,
    icon: info.icon, price: formatModelPrice(info), desc: info.description,
  };
});

const CLASS_OPTIONS = ["Boardroom", "Engineering", "QA", "Design", "Strategy", "Product", "Other"];

const PM_ICONS: Record<(typeof PERMISSION_MODE_OPTS)[number], IconName> = {
  bypassPermissions: "play",
  default: "help-circle",
  plan: "lock",
};

/** Row accent per permission mode — trust (green) → caution (accent) → lockdown (red). */
const PM_COLOR: Record<(typeof PERMISSION_MODE_OPTS)[number], string> = {
  bypassPermissions: "var(--green)",
  default: "var(--acc)",
  plan: "var(--red)",
};

/** i18n message-key stem per permission mode — see `agent_editor.permission_*_label/subtitle` in messages/en.json. */
const PM_MSG_KEY: Record<(typeof PERMISSION_MODE_OPTS)[number], "bypass" | "default" | "plan"> = {
  bypassPermissions: "bypass",
  default: "default",
  plan: "plan",
};

const FACTION_SWATCH: Record<UnitFaction, string> = {
  blue: "linear-gradient(145deg,#5aa9e6,#2f6bb0)",
  red: "linear-gradient(145deg,#e6635a,#a02434)",
  purple: "linear-gradient(145deg,#b07fe0,#7a3fb0)",
  yellow: "linear-gradient(145deg,#efc75e,#c8a020)",
  black: "linear-gradient(145deg,#5a5560,#242833)",
};

const DESC_MAX = 240;
const SKILL_SLOTS = 6;
const SUGGEST_CAP = 12;

/* ── Section card ─────────────────────────────────────────────── */

function SectionCard({ n, title, sub, complete, children }: {
  n: string; title: string; sub: string; complete: boolean; children: React.ReactNode;
}) {
  return (
    <section className="surface-sheen shadow-[var(--lift)] overflow-hidden rounded-[22px]">
      <div className="flex items-center border-b border-edge gap-[12px] px-[20px] py-[16px]">
        <div
          className="flex items-center justify-center shrink-0 w-[26px] h-[26px] rounded-[9px] font-[var(--font-mono)] text-[11px] font-bold"
          style={{
            background: complete ? "linear-gradient(120deg,var(--acc),var(--acc-2))" : "var(--card-2)",
            color: complete ? "#fff" : "var(--txt-4)",
          }}
        >
          {n}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-txt font-bold m-0 text-[14.5px] whitespace-nowrap">{title}</h3>
          <div className="text-txt-4 font-[var(--font-mono)] text-[11px] mt-[2px] whitespace-nowrap">{sub}</div>
        </div>
        {complete && (
          <span className="flex items-center gap-[5px] text-[10px] font-bold tracking-[0.05em] px-[9px] py-[3px] rounded-full bg-green-soft text-green whitespace-nowrap shrink-0">
            READY
          </span>
        )}
      </div>
      <div className="flex flex-col px-[20px] py-[18px] gap-[16px]">{children}</div>
    </section>
  );
}

/* ── Class chips (tinted per class, matching the live-preview badge) ──── */
// `room` doubles as the agent's category/department in `categorize.ts`.
// Picking a class here writes straight to that field so the gallery's
// filter chips pick it up without a heuristic fallback.

function ClassPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const isCustom = value !== "" && !CLASS_OPTIONS.includes(value);

  const commitCustom = () => {
    const v = customInput.trim();
    if (v) onChange(v);
    setCustomInput("");
    setCustomOpen(false);
  };

  const chip = (opt: string, active: boolean, onClick: () => void, trailing?: React.ReactNode) => {
    const color = categoryColor(opt);
    return (
      <button
        key={opt}
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-[6px] px-[10px] py-[5px] rounded-full text-[11.5px] font-semibold cursor-pointer border transition-[background,border-color,color] duration-[120ms] font-[inherit] whitespace-nowrap"
        style={active
          ? { borderColor: "transparent", background: `color-mix(in srgb, ${color} 16%, transparent)`, color }
          : { borderColor: "var(--edge)", background: "var(--card-2)", color: "var(--txt-3)" }}
      >
        {opt}
        {trailing}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-[6px]">
      {CLASS_OPTIONS.map((opt) => chip(opt, value === opt, () => onChange(value === opt ? "" : opt)))}
      {isCustom && chip(value, true, () => onChange(""), <Icon name="x" size={10} />)}
      {customOpen ? (
        <input
          autoFocus
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onBlur={commitCustom}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitCustom(); }
            if (e.key === "Escape") { setCustomInput(""); setCustomOpen(false); }
          }}
          placeholder="Class name"
          className="bg-card-2 border border-edge rounded-full px-[10px] py-[5px] text-[11.5px] text-txt outline-none w-[110px] font-[inherit] focus:border-[var(--acc-line)]"
        />
      ) : (
        <button
          type="button"
          onClick={() => setCustomOpen(true)}
          className="inline-flex items-center gap-[4px] px-[10px] py-[5px] rounded-full text-[11.5px] font-semibold cursor-pointer border border-dashed border-edge-2 bg-transparent text-txt-4 hover:bg-card-2 hover:text-txt font-[inherit]"
        >
          <Icon name="plus" size={10} /> Add
        </button>
      )}
    </div>
  );
}

/* ── Permission mode shield badge ─────────────────────────────── */

function PermissionShield({ pm, active }: { pm: (typeof PERMISSION_MODE_OPTS)[number]; active: boolean }) {
  const color = PM_COLOR[pm];
  return (
    <span
      className="relative w-[42px] h-[46px] shrink-0 flex items-center justify-center"
      style={{ color: active ? color : "var(--txt-4)", filter: active ? `drop-shadow(0 0 8px ${color})` : "none" }}
    >
      <svg width="42" height="46" viewBox="0 0 24 26" className="absolute inset-0">
        <path
          d="M12 1 22 4.5V13c0 6.5-5.5 10-10 12C7.5 23 2 19.5 2 13V4.5z"
          fill={active ? `color-mix(in srgb, ${color} 16%, transparent)` : "var(--card-2)"}
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </svg>
      <span className="relative">
        <Icon name={PM_ICONS[pm]} size={13} />
      </span>
    </span>
  );
}

/* ── Skills loadout — equipped icon-cards + searchable available pool ── */

function SkillsLoadout({ chips, suggestions, iconFor, onAdd, onRemove }: {
  chips: string[];
  suggestions: Array<{ id: string }>;
  iconFor: (name: string) => IconConfig;
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const pool = suggestions.filter((s) => !chips.includes(s.id));
  const matched = q ? pool.filter((s) => s.id.toLowerCase().includes(q)) : pool;
  const shown = q ? matched : matched.slice(0, SUGGEST_CAP);
  const hiddenCount = q ? 0 : Math.max(0, matched.length - SUGGEST_CAP);

  const commitQuery = () => {
    const v = query.trim();
    if (v && !chips.includes(v)) onAdd(v);
    setQuery("");
  };

  return (
    <div className="flex flex-col gap-[5px]">
      <div className="flex items-center mb-[1px]">
        <label className="uppercase flex items-center text-txt-3 font-semibold text-[11px] tracking-[0.06em] gap-[5px]"><Icon name="layers" size={11} /> Equipped skills</label>
        <span className="flex-1" />
        <span className="font-[var(--font-mono)] text-[10px] text-txt-4 whitespace-nowrap">{chips.length} of {SKILL_SLOTS} slots</span>
      </div>
      <div className="flex flex-wrap gap-[9px]">
        {chips.map((name) => (
          <div key={name} className="flex items-center gap-[9px] flex-none basis-[calc(33.333%-6px)] min-w-[150px] px-[11px] py-[9px] rounded-[13px] bg-card-2 border border-edge shadow-[var(--inset-hi)]">
            <WeaponIcon config={iconFor(name)} size={26} particles="none" />
            <span className="flex-1 min-w-0 text-[11.5px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis">{name}</span>
            <button
              type="button"
              onClick={() => onRemove(name)}
              aria-label={`Remove ${name}`}
              className="w-[18px] h-[18px] shrink-0 flex items-center justify-center rounded-[6px] text-txt-4 cursor-pointer bg-transparent border-none transition-colors duration-[130ms] hover:bg-red-soft hover:text-red"
            >
              <Icon name="x" size={10} />
            </button>
          </div>
        ))}
        {chips.length < SKILL_SLOTS && (
          <div className="flex-none basis-[calc(33.333%-6px)] min-w-[150px] flex items-center justify-center px-[11px] py-[9px] rounded-[13px] border border-dashed border-edge-2 text-txt-4 text-[11px] font-semibold whitespace-nowrap">
            empty slot
          </div>
        )}
      </div>

      <div className="text-txt-4 uppercase font-[var(--font-mono)] text-[9.5px] tracking-[0.07em] mt-[8px] mb-[2px]">Available</div>
      <div className="flex flex-wrap items-center gap-[6px]" onClick={() => inputRef.current?.focus()}>
        {shown.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); onAdd(s.id); }}
            className="flex items-center gap-[6px] pl-[6px] pr-[10px] py-[5px] rounded-full cursor-pointer bg-card-2 border border-edge transition-colors duration-[140ms] hover:border-[var(--acc-line)]"
          >
            <WeaponIcon config={iconFor(s.id)} size={18} particles="none" />
            <span className="font-[var(--font-mono)] text-[10.5px] text-txt-3 whitespace-nowrap">{s.id}</span>
            <Icon name="plus" size={10} className="text-txt-4" />
          </button>
        ))}
        {hiddenCount > 0 && <span className="font-[var(--font-mono)] text-[10.5px] text-txt-4 whitespace-nowrap">+{hiddenCount} more — type to search</span>}
        <div
          className="flex items-center gap-[7px] px-[10px] py-[5px] min-w-[140px] rounded-full bg-card-2 border border-edge cursor-text focus-within:border-[var(--acc-line)]"
        >
          <Icon name="search" size={11} className="text-txt-4 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitQuery(); } }}
            placeholder="search or add…"
            className="flex-1 min-w-[70px] bg-transparent border-none outline-none text-txt-2 font-[var(--font-mono)] text-[10.5px]"
          />
        </div>
      </div>
    </div>
  );
}

/* ── Main form ────────────────────────────────────────────────── */

export type AgentEditorFormProps = {
  mode: "new" | "edit";
  /** Required for `mode="edit"` — the loaded agent's current values. */
  initial?: AgentFormValues;
  /** Fires after a successful create/save. Defaults to navigating to the
   *  agent's detail page. */
  onSaved?: (id: string) => void;
  /** Fires when Cancel is clicked (full-page mode only). Defaults to
   *  `router.back()`. */
  onCancel?: () => void;
  /** Fires after a successful delete (`mode="edit"` only). Defaults to
   *  navigating to the agents list. */
  onDeleted?: () => void;
  /** Renders inside a modal tab instead of as a full page: drops the
   *  breadcrumb/title header and switches the save bar from viewport-pinned
   *  to `sticky` within the caller's own scroll container. */
  embedded?: boolean;
};

export function AgentEditorForm({ mode, initial, onSaved, onCancel, onDeleted, embedded = false }: AgentEditorFormProps) {
  const router = useRouter();
  const t = useTranslations();
  const pmLabel = (pm: (typeof PERMISSION_MODE_OPTS)[number]) => t(`agent_editor.permission_${PM_MSG_KEY[pm]}_label`);
  const pmSubtitle = (pm: (typeof PERMISSION_MODE_OPTS)[number]) => t(`agent_editor.permission_${PM_MSG_KEY[pm]}_subtitle`);
  const createMut = useCreateAgent();
  const writeMut = useWriteAgent();
  const deleteMut = useDeleteAgent();
  const { data: installedSkills } = useInstalledSkills();
  const { data: skillIcons } = useSkillIcons();

  const startingValues = initial ?? EMPTY_FORM;
  const [values, setValues] = useState<AgentFormValues>(startingValues);
  // Baseline for the "dirty" diff — reset to the just-saved values after a
  // successful save so the unsaved-changes badge clears without a remount.
  const [baseline, setBaseline] = useState<AgentFormValues>(startingValues);
  const [errors, setErrors] = useState<FormError[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(mode === "edit");

  const set = useCallback(<K extends keyof AgentFormValues>(key: K, val: AgentFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: val }));
  }, []);

  const rerollUnit = useCallback(() => {
    const faction = UNIT_FACTIONS[Math.floor(Math.random() * UNIT_FACTIONS.length)]!;
    const kind = UNIT_KINDS[Math.floor(Math.random() * UNIT_KINDS.length)]!;
    set("unit", formatUnit({ faction, kind }));
  }, [set]);

  const errFor = (field: keyof AgentFormValues) => errors.find((e) => e.field === field)?.message;

  const slug = mode === "edit" ? values.id : slugifyId(values.id || values.name);
  const unit = unitForAgent(values.name, values.unit || null);
  const skillSuggestions = (installedSkills ?? []).map((s) => ({ id: s.name }));
  const iconForSkill = (name: string): IconConfig => {
    const source = (installedSkills ?? []).find((s) => s.name === name)?.provenance?.source ?? "local";
    return skillIconConfig(skillIcons, skillIconKey({ source, name }));
  };
  const skillChips = parseCsv(values.skills);
  const toolChips = parseCsv(values.tools);
  const toolPool = [...TOOL_SUGGESTIONS, ...toolChips.filter((c) => !TOOL_SUGGESTIONS.some((s) => s.id === c)).map((id) => ({ id, desc: "" }))];
  const dirtyCount = (Object.keys(baseline) as (keyof AgentFormValues)[]).filter((k) => values[k] !== baseline[k]).length;

  const sec1Done = !!(values.name.trim() && values.desc.trim());
  const sec2Done = !!(values.model && values.effort && values.pm);
  const sec3Done = toolChips.length > 0 || skillChips.length > 0;
  const sec4Done = values.body.length > 20;
  const completed = [sec1Done, sec2Done, sec3Done, sec4Done].filter(Boolean).length;

  const isPending = createMut.isPending || writeMut.isPending;

  const handleSubmit = useCallback(() => {
    setServerError(null);
    const errs = validateForm(values);
    setErrors(errs);
    if (errs.length > 0) return;
    const body = toBody(values);
    const onSuccess = ({ id }: { id: string }) => {
      setBaseline(values);
      if (onSaved) onSaved(id);
      else router.push(PAGE_ROUTES.agent(id));
    };
    const onError = (err: unknown) => setServerError(err instanceof Error ? err.message : String(err));
    if (mode === "new") createMut.mutate(body, { onSuccess, onError });
    else writeMut.mutate(body, { onSuccess, onError });
  }, [values, mode, createMut, writeMut, onSaved, router]);

  const handleDiscard = () => setValues(baseline);

  const handleCancel = () => (onCancel ? onCancel() : router.back());

  const handleDelete = () => {
    if (mode !== "edit") return;
    if (!window.confirm(`Delete agent "${values.id}"? This cannot be undone.`)) return;
    deleteMut.mutate(values.id, {
      onSuccess: () => {
        if (onDeleted) onDeleted();
        else router.push(PAGE_ROUTES.agents);
      },
      onError: (err) => setServerError(err instanceof Error ? err.message : String(err)),
    });
  };

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); handleSubmit(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleSubmit]);

  const stageGlow = `color-mix(in srgb, ${categoryColor(values.room || "Other")} 55%, transparent)`;

  return (
    <div className={cn("flex flex-col min-h-0 relative", embedded ? "flex-1" : "h-full")}>
      {/* Body — full page owns its own scroll (`overflow-y-auto`, bottom
          padding reserved for the floating save bar below). Embedded mode
          renders in normal flow instead: the modal tab's own container does
          the scrolling, and the save bar is a sticky trailing sibling. */}
      <div className={cn("flex flex-col gap-[16px]", embedded ? "px-6 pt-5" : "flex-1 min-h-0 overflow-y-auto px-[28px] py-[24px] pb-[120px]")}>
        {/* Breadcrumb / title bar — full-page mode only. Embedded (modal tab)
            usage already has its own header with the agent's name/avatar/close
            button. */}
        {!embedded && (
          <div className="flex items-center gap-[10px] shrink-0 surface-sheen shadow-[var(--lift)] rounded-[18px] pl-[16px] pr-[8px] py-[12px]">
            <div className="flex items-baseline gap-[10px] min-w-0">
              <h1 className="m-0 text-[21px] font-extrabold tracking-[-0.03em] whitespace-nowrap">{mode === "new" ? "Forge agent" : "Edit agent"}</h1>
              {mode === "edit" && (
                <span className="font-[var(--font-mono)] text-[11px] text-txt-4 whitespace-nowrap overflow-hidden text-ellipsis">
                  {`~/.claude/agents/${values.id}.md`}
                </span>
              )}
            </div>
            <span className="flex-1" />
            <button
              type="button"
              title="Cancel"
              onClick={handleCancel}
              className="w-[36px] h-[36px] shrink-0 flex items-center justify-center rounded-[12px] border-none bg-transparent text-txt-3 cursor-pointer transition-colors duration-[140ms] hover:bg-card-2 hover:text-txt"
            >
              <Icon name="x" size={15} />
            </button>
          </div>
        )}

        <div className="flex items-start gap-[16px]">
          {/* Live preview / stage column */}
          <aside className="flex flex-col sticky top-0 gap-[14px] w-[308px] shrink-0 max-[900px]:hidden">
            <div className="relative rounded-[22px] surface-sheen shadow-[var(--lift)] px-[20px] pt-[22px] pb-[20px]">
              {/* Glow layer — clipped to the card's own rounded box so it can't
                  bleed above/around the card. The card itself stays
                  overflow-visible so a tall sprite (e.g. the lancer's spear)
                  isn't cut off. */}
              <div aria-hidden className="absolute inset-0 overflow-hidden rounded-[22px] pointer-events-none">
                <div
                  className="absolute left-1/2 -top-[90px] w-[300px] h-[260px] -translate-x-1/2"
                  style={{ background: `radial-gradient(circle at 50% 50%, ${stageGlow}, transparent 64%)` }}
                />
              </div>

              <div className="relative flex flex-col items-center">
                <div className="relative h-[150px] flex items-end justify-center">
                  <span
                    aria-hidden
                    className="absolute bottom-[6px] w-[120px] h-[26px] rounded-full"
                    style={{ background: `radial-gradient(ellipse at 50% 50%, ${stageGlow}, transparent 68%)` }}
                  />
                  <span aria-hidden className="absolute bottom-[10px] w-[92px] h-[10px] rounded-full bg-black/35 blur-[3px]" />
                  {/* Absolutely positioned and bottom-anchored so a taller
                      `contain` box (the lancer's spear) overlaps upward out of
                      the card instead of growing this fixed-height stage —
                      every unit kind keeps the exact same card height. */}
                  <UnitSprite
                    unit={unit}
                    size={140}
                    contain
                    className="absolute bottom-[10px] left-1/2 -translate-x-1/2"
                    label={values.name || "Agent preview"}
                  />
                </div>

                <div className="text-center leading-[1.3]">
                  <div className="text-[17px] font-extrabold tracking-[-0.02em] text-txt">
                    {values.name.trim() || <span className="text-txt-4">Untitled agent</span>}
                  </div>
                  <div className="font-[var(--font-mono)] text-[10.5px] text-txt-4 mt-[4px]">{slug || "agent-id"}</div>
                </div>

                {values.room ? (
                  <span
                    className="mt-[9px] text-[9.5px] font-bold uppercase tracking-[0.05em] px-[10px] py-[3px] rounded-full whitespace-nowrap"
                    style={{
                      background: `color-mix(in srgb, ${categoryColor(values.room)} 16%, transparent)`,
                      color: categoryColor(values.room),
                    }}
                  >
                    {values.room}
                  </span>
                ) : null}

                <div className="w-full mt-[18px] pt-[16px] border-t border-edge">
                  <div className="text-txt-4 uppercase font-[var(--font-mono)] text-[9.5px] tracking-[0.08em] mb-[9px]">Faction</div>
                  <div className="flex items-center gap-[7px]">
                    {UNIT_FACTIONS.map((f) => {
                      const active = unit.faction === f;
                      return (
                        <button
                          key={f}
                          type="button"
                          title={FACTION_LABELS[f]}
                          onClick={() => set("unit", formatUnit({ faction: f, kind: unit.kind }))}
                          className="w-[26px] h-[26px] rounded-[9px] cursor-pointer transition-transform duration-[140ms] hover:-translate-y-[2px]"
                          style={{
                            background: FACTION_SWATCH[f],
                            boxShadow: active ? "0 0 0 2px var(--card), 0 0 0 4px var(--acc)" : "0 0 0 1px var(--edge-2)",
                          }}
                        />
                      );
                    })}
                    <span className="flex-1" />
                    <button
                      type="button"
                      title="Reroll unit"
                      onClick={rerollUnit}
                      className="w-[26px] h-[26px] flex items-center justify-center rounded-[9px] bg-card-2 border border-edge-2 text-txt-3 hover:text-txt hover:border-[var(--txt-4)] transition-colors cursor-pointer"
                    >
                      <Icon name="refresh" size={12} />
                    </button>
                  </div>

                  <div className="text-txt-4 uppercase font-[var(--font-mono)] text-[9.5px] tracking-[0.08em] mt-[14px] mb-[9px]">Unit</div>
                  <div className="flex flex-wrap gap-[6px]">
                    {UNIT_KINDS.map((k) => {
                      const active = unit.kind === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => set("unit", formatUnit({ faction: unit.faction, kind: k }))}
                          className="px-[11px] py-[6px] rounded-full text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-[background,color] duration-[140ms]"
                          style={active
                            ? { background: "linear-gradient(120deg,var(--acc),var(--acc-2))", color: "#fff", boxShadow: "0 8px 16px -9px rgba(139,123,255,.8)" }
                            : { background: "var(--card-2)", color: "var(--txt-3)" }}
                        >
                          {UNIT_DEFS[k].label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="w-full flex flex-wrap gap-[8px] mt-[16px]">
                  {[
                    { label: "Model", value: values.model || "-", fg: "var(--acc)" },
                    { label: "Effort", value: values.effort || "-", fg: "var(--amber)" },
                    { label: "Permission", value: PM_MSG_KEY[values.pm as keyof typeof PM_MSG_KEY] ? pmLabel(values.pm as keyof typeof PM_MSG_KEY) : (values.pm || "-"), fg: "var(--cyan)" },
                    { label: "Loadout", value: `${skillChips.length} sk · ${toolChips.length} tools`, fg: "var(--txt-2)" },
                  ].map((sb) => (
                    <div key={sb.label} className="flex-1 basis-[calc(50%-4px)] bg-card-2 border border-edge px-[11px] py-[9px] rounded-[12px] shadow-[var(--inset-hi)] leading-[1.3]">
                      <div className="text-txt-4 uppercase font-[var(--font-mono)] text-[9px] tracking-[0.07em]">{sb.label}</div>
                      <div className="font-semibold font-[var(--font-mono)] text-[12.5px] mt-[2px] truncate" style={{ color: sb.fg }}>{sb.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* Main column */}
          <div className="flex flex-col flex-1 min-w-0 gap-[16px]">

            {/* Section 1 - Identity */}
            <SectionCard n="1" title="Identity" sub="how this agent is named and described" complete={sec1Done}>
              <div className="flex flex-col gap-[5px]">
                <label className="uppercase flex items-center text-txt-3 font-semibold text-[11px] tracking-[0.06em] gap-[5px]">Name</label>
                <input
                  className={cn(
                    "w-full px-[15px] py-[13px] rounded-[14px] border bg-card-2 shadow-[var(--inset-hi)] text-txt font-[inherit] text-[16px] font-bold outline-none transition-colors duration-[120ms] focus:border-[var(--acc-line)]",
                    errFor("name") ? "border-status-error" : "border-edge",
                  )}
                  value={values.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setValues((v) => ({ ...v, name, id: slugEdited ? v.id : slugifyId(name) }));
                  }}
                  placeholder="Frontend Pragmatist"
                  autoFocus={mode === "new"}
                />
                {errFor("name") && <span className="text-[11px] text-status-error">{errFor("name")}</span>}
              </div>

              <div className="flex flex-wrap gap-[12px]">
                <div className="flex flex-col gap-[5px] flex-1 basis-[220px] min-w-[220px]">
                  <label className="uppercase flex items-center text-txt-3 font-semibold text-[11px] tracking-[0.06em] gap-[5px]">
                    Id (slug) {mode === "new" && <span className="normal-case text-txt-4">· auto</span>}
                  </label>
                  <div className={cn(
                    "flex items-center px-[13px] py-[11px] rounded-[13px] border bg-card-2 shadow-[var(--inset-hi)] font-[var(--font-mono)] text-[11.5px] text-txt-3 overflow-hidden transition-colors duration-[120ms] focus-within:border-[var(--acc-line)]",
                    errFor("id") ? "border-status-error" : "border-edge",
                    mode === "edit" && "opacity-60",
                  )}>
                    <span className="opacity-60 shrink-0 select-none">~/.claude/agents/</span>
                    <input
                      className="flex-1 min-w-0 bg-transparent border-none outline-none text-acc font-[inherit] text-[11.5px]"
                      value={values.id || slug}
                      onChange={(e) => { setSlugEdited(true); set("id", e.target.value); }}
                      placeholder="my-agent"
                      disabled={mode === "edit"}
                      title={mode === "edit" ? "ID cannot be changed after creation" : undefined}
                    />
                    <span className="opacity-60 shrink-0 select-none">.md</span>
                  </div>
                  {errFor("id") && <span className="text-[11px] text-status-error">{errFor("id")}</span>}
                </div>

                <div className="flex flex-col gap-[5px] flex-1 basis-[280px] min-w-[280px]">
                  <label className="uppercase flex items-center text-txt-3 font-semibold text-[11px] tracking-[0.06em] gap-[5px] justify-between">
                    <span>Description</span>
                    <span className={`font-normal normal-case tracking-[0] font-[var(--font-mono)] ${values.desc.length > DESC_MAX ? "text-status-error" : "text-txt-4"}`}>
                      {values.desc.length}/{DESC_MAX}
                    </span>
                  </label>
                  <div className={cn(
                    "flex items-center px-[13px] py-[11px] rounded-[13px] border bg-card-2 shadow-[var(--inset-hi)] transition-colors duration-[120ms] focus-within:border-[var(--acc-line)]",
                    errFor("desc") ? "border-status-error" : "border-edge",
                  )}>
                    <input
                      className="flex-1 bg-transparent border-none outline-none text-txt-2 text-[12.5px] font-[inherit]"
                      value={values.desc}
                      onChange={(e) => set("desc", e.target.value)}
                      placeholder="One-line description of when to summon this agent."
                      maxLength={DESC_MAX + 20}
                    />
                  </div>
                  {errFor("desc") && <span className="text-[11px] text-status-error">{errFor("desc")}</span>}
                </div>
              </div>

              <div className="flex flex-col gap-[8px]">
                <label className="uppercase flex items-center text-txt-3 font-semibold text-[11px] tracking-[0.06em] gap-[5px]">Class</label>
                <ClassPicker value={values.room} onChange={(v) => set("room", v)} />
              </div>
            </SectionCard>

            {/* Section 2 - Gear */}
            <SectionCard n="2" title="Gear" sub="model, effort, and execution policy" complete={sec2Done}>
              {/* Model */}
              <div className="flex flex-col gap-[9px]">
                <label className="uppercase flex items-center text-txt-3 font-semibold text-[11px] tracking-[0.06em] gap-[5px]">Model — pick your core</label>
                <div className="flex flex-wrap gap-[10px]">
                  {MODELS.map((m) => {
                    const tier = { fg: MODEL_CATALOG[m.id].tierColorVar };
                    const active = values.model === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className="relative text-left bg-card-2 border cursor-pointer flex flex-col flex-1 basis-[160px] min-w-[160px] rounded-[15px] overflow-hidden transition-transform duration-150 font-[inherit] hover:-translate-y-[2px]"
                        style={{
                          borderColor: active ? "transparent" : "var(--edge)",
                          boxShadow: active ? `0 0 0 1px ${tier.fg}, 0 14px 28px -16px rgba(139,123,255,.55)` : "var(--inset-hi)",
                        }}
                        onClick={() => set("model", m.id)}
                      >
                        <span className="flex flex-col gap-[7px] px-[13px] pt-[13px] pb-[12px]">
                          <span className="flex items-center gap-[9px]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={m.icon} alt="" className="w-[44px] h-[44px] shrink-0 object-contain" />
                            <span className="flex flex-col gap-[2px] min-w-0">
                              <span className="text-[14px] font-extrabold text-txt whitespace-nowrap">{m.name}</span>
                              <span className="text-[9px] font-bold uppercase tracking-[0.06em]" style={{ color: tier.fg }}>{m.badge} tier</span>
                            </span>
                          </span>
                          <span className="font-[var(--font-mono)] text-[9.5px] text-txt-4 whitespace-nowrap overflow-hidden text-ellipsis -mt-[3px]">{m.full} · {m.price}</span>
                          <span className="text-[10.5px] leading-[1.5] text-txt-3" style={{ textWrap: "pretty" }}>{m.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Effort */}
              <div className="flex flex-col gap-[5px]">
                <div className="flex items-center mb-[1px]">
                  <label className="uppercase flex items-center text-txt-3 font-semibold text-[11px] tracking-[0.06em] gap-[5px]">Effort — power level</label>
                  <span className="flex-1" />
                  <span className="text-txt-4 text-[10.5px]">more thinking tokens before responding</span>
                </div>
                <div className="relative px-[22px] pt-[20px] pb-[14px] rounded-[15px] bg-card-2 border border-edge shadow-[var(--inset-hi)]">
                  {(() => {
                    const activeIndex = EFFORT_OPTS.findIndex((id) => id === values.effort);
                    return (
                      <>
                  <div className="absolute left-[36px] right-[36px] top-[29px] h-[3px] rounded-full bg-card-3">
                    <div
                      className="h-full rounded-full transition-[width] duration-200"
                      style={{
                        width: `${(activeIndex / (EFFORT_OPTS.length - 1)) * 100}%`,
                        background: "linear-gradient(90deg,var(--acc-2),var(--acc))",
                        boxShadow: "0 0 10px 1px rgba(139,123,255,0.6)",
                      }}
                    />
                  </div>
                  <div className="relative flex items-start justify-between">
                    {EFFORT_OPTS.map((id, i) => {
                      const active = i === activeIndex;
                      const passed = i < activeIndex;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => set("effort", id)}
                          className="flex flex-col items-center gap-[9px] cursor-pointer bg-transparent border-none p-0 font-[inherit]"
                        >
                          <span
                            className="w-[20px] h-[20px] rounded-full flex items-center justify-center transition-[background,box-shadow] duration-150"
                            style={{
                              background: active || passed ? "linear-gradient(145deg,var(--acc),var(--acc-2))" : "var(--card-3)",
                              boxShadow: active
                                ? "0 0 0 3px var(--card-2), 0 0 14px 2px rgba(139,123,255,.75)"
                                : "0 0 0 3px var(--card-2), var(--inset-hi)",
                            }}
                          >
                            {active && <span className="w-[7px] h-[7px] rounded-full bg-white" />}
                          </span>
                          <span className={`font-[var(--font-mono)] text-[11px]${active ? " font-bold text-acc" : " text-txt-3"}`}>{id}</span>
                        </button>
                      );
                    })}
                  </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Permission */}
              <div className="flex flex-col gap-[9px]">
                <label className="uppercase flex items-center text-txt-3 font-semibold text-[11px] tracking-[0.06em] gap-[5px]">Permission mode — trust alignment</label>
                <div className="flex flex-wrap gap-[10px]">
                  {PERMISSION_MODE_OPTS.map((pm) => {
                    const active = values.pm === pm;
                    const color = PM_COLOR[pm];
                    return (
                      <button
                        key={pm}
                        type="button"
                        className="relative flex flex-col items-center gap-[9px] flex-1 basis-[160px] min-w-[160px] text-center cursor-pointer bg-card-2 border pt-[16px] pb-[13px] px-[12px] rounded-[15px] transition-transform duration-150 font-[inherit] hover:-translate-y-[2px]"
                        style={{
                          borderColor: active ? "transparent" : "var(--edge)",
                          boxShadow: active ? `0 0 0 1px ${color}, 0 14px 28px -16px rgba(139,123,255,.5)` : "var(--inset-hi)",
                        }}
                        onClick={() => set("pm", pm)}
                      >
                        <PermissionShield pm={pm} active={active} />
                        <span className="flex flex-col items-center min-w-0">
                          <span className="font-bold text-[13px] whitespace-nowrap" style={{ color: active ? color : "var(--txt)" }}>{pmLabel(pm)}</span>
                          <span className="font-[var(--font-mono)] text-[10px] text-txt-4 mt-[2px] whitespace-nowrap overflow-hidden text-ellipsis max-w-full">{pmSubtitle(pm)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </SectionCard>

            {/* Section 3 - Loadout */}
            <SectionCard n="3" title="Loadout" sub="equipped skills and allowed tools" complete={sec3Done}>
              <SkillsLoadout
                chips={skillChips}
                suggestions={skillSuggestions}
                iconFor={iconForSkill}
                onAdd={(v) => set("skills", toCsv([...skillChips, v]))}
                onRemove={(v) => set("skills", toCsv(skillChips.filter((c) => c !== v)))}
              />
              <div className="flex flex-col gap-[8px]">
                <label className="uppercase flex items-center text-txt-3 font-semibold text-[11px] tracking-[0.06em] gap-[5px]"><Icon name="hammer" size={11} /> Tools allowed</label>
                <div className="flex flex-wrap gap-[6px]">
                  {toolPool.map((tl) => {
                    const on = toolChips.includes(tl.id);
                    return (
                      <button
                        key={tl.id}
                        type="button"
                        title={tl.desc || undefined}
                        onClick={() => set("tools", toCsv(on ? toolChips.filter((c) => c !== tl.id) : [...toolChips, tl.id]))}
                        className="flex items-center gap-[6px] px-[11px] py-[6px] rounded-[10px] cursor-pointer font-[var(--font-mono)] text-[10.5px] border whitespace-nowrap transition-[background,color,border-color] duration-[140ms]"
                        style={on
                          ? { background: "var(--acc-soft)", color: "var(--acc)", borderColor: "var(--acc-line)" }
                          : { background: "var(--card-2)", color: "var(--txt-4)", borderColor: "var(--edge)" }}
                      >
                        {tl.id}
                      </button>
                    );
                  })}
                </div>
              </div>
            </SectionCard>

            {/* Section 4 - System prompt */}
            <SectionCard
              n="4"
              title="System prompt"
              sub="markdown body · the agent's standing orders"
              complete={sec4Done}
            >
              <CodeEditor
                value={values.body}
                onChange={(v) => set("body", v)}
                placeholder="Write your system prompt here…"
                minHeight={190}
                renderPreview={(md) => <DocsRender markdown={md} />}
              />
              {errFor("body") && <span className="text-[11px] text-status-error">{errFor("body")}</span>}
              {serverError && (
                <div className="bg-status-error text-white rounded-[6px] px-3 py-2 text-[12px]">
                  {serverError}
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        {/* Save bar — a normal, in-flow trailing card when embedded (sticky to
            the modal tab's own scroll container); a floating card pinned to
            the bottom of the viewport in full-page mode. */}
        {embedded && (
          <div className="sticky bottom-0 flex items-center gap-[14px] px-[18px] py-[14px] rounded-[20px] surface-sheen shadow-[var(--lift)] -mx-6 mt-[-1px]">
            {mode === "edit" && (
              <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleteMut.isPending}>
                <Icon name="x" size={12} /> Delete
              </Button>
            )}
            <span className="inline-flex items-center shrink-0 gap-[8px] font-[var(--font-mono)] text-[12px] text-[#f59e0b]">
              {dirtyCount > 0 && <span className="w-[6px] h-[6px] rounded-full bg-[#f59e0b] [box-shadow:0_0_8px_#f59e0b] animate-[pulse_1.4s_infinite]" />}
              {dirtyCount > 0 ? `${dirtyCount} unsaved field${dirtyCount !== 1 ? "s" : ""}` : "No changes"}
            </span>
            <div className="ml-auto flex gap-[8px]">
              {dirtyCount > 0 && mode === "edit" && (
                <Button variant="ghost" onClick={handleDiscard} disabled={isPending}>
                  <Icon name="refresh" size={12} /> Revert
                </Button>
              )}
              <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
                <Icon name="hammer" size={13} />
                {isPending ? "Saving…" : "Save changes"}
                <span className="inline-block bg-[rgba(255,255,255,.16)] text-white/85 px-[6px] py-[2px] rounded-[5px] font-mono text-[10px]">⌘S</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {!embedded && (
        <div className="absolute flex items-center pointer-events-none left-0 right-0 bottom-0 px-[28px] py-[14px] z-[4] [background:linear-gradient(180deg,transparent,var(--bg-0)_22%)]">
          <div className="flex-1 flex items-center gap-[12px] px-[18px] py-[14px] rounded-[20px] surface-sheen shadow-[var(--lift)] pointer-events-auto">
            {mode === "edit" && (
              <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleteMut.isPending}>
                <Icon name="x" size={12} /> Delete
              </Button>
            )}
            {mode === "new" ? (
              <span
                className="text-[12px] font-semibold whitespace-nowrap"
                style={{ color: completed === 4 ? "var(--green)" : "var(--txt-3)" }}
              >
                {completed === 4 ? "Ready to forge" : "Draft"}
              </span>
            ) : (
              <span className="inline-flex items-center shrink-0 gap-[8px] font-[var(--font-mono)] text-[12px] text-[#f59e0b] whitespace-nowrap">
                {dirtyCount > 0 && <span className="w-[6px] h-[6px] rounded-full bg-[#f59e0b] [box-shadow:0_0_8px_#f59e0b] animate-[pulse_1.4s_infinite]" />}
                {dirtyCount > 0 ? `${dirtyCount} unsaved field${dirtyCount !== 1 ? "s" : ""}` : "No changes"}
              </span>
            )}
            <span className="text-txt-4 flex-1 font-[var(--font-mono)] text-[10.5px] whitespace-nowrap overflow-hidden text-ellipsis">
              will write to ~/.claude/agents/{slug || "…"}.md
            </span>
            <div className="flex gap-[8px] shrink-0">
              {dirtyCount > 0 && mode === "edit" && (
                <Button variant="ghost" onClick={handleDiscard} disabled={isPending}>
                  <Icon name="refresh" size={12} /> Revert
                </Button>
              )}
              <button
                type="button"
                onClick={handleCancel}
                disabled={isPending}
                className="w-[36px] h-[36px] flex items-center justify-center rounded-[13px] border-none bg-transparent text-txt-3 cursor-pointer transition-colors duration-[140ms] hover:bg-card-2 hover:text-txt disabled:opacity-50 disabled:cursor-not-allowed"
                title="Cancel"
              >
                <Icon name="x" size={15} />
              </button>
              <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
                <Icon name="hammer" size={13} />
                {isPending ? (mode === "new" ? "Forging…" : "Saving…") : mode === "new" ? "Forge agent" : "Save changes"}
                <span className="inline-block bg-[rgba(255,255,255,.16)] text-white/85 px-[6px] py-[2px] rounded-[5px] font-mono text-[10px]">⌘S</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
