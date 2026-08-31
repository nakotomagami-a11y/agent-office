"use client";

import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { unitForAgent } from "@/components/ui/unit-sprite-registry";
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
import { useInstalledSkills } from "@/modules/skills/hooks/use-skills";
import { Button } from "@/components/ui/button";
import { CodeEditor } from "@/components/ui/code-editor";
import { DocsRender } from "@/modules/docs/docs-render";
import { MODEL_FULL, EFFORT_OPTS, PERMISSION_MODE_OPTS } from "@agent-office/domain/config/agent-opts";
import {
  UNIT_FACTIONS,
  UNIT_KINDS,
  UNIT_DEFS,
  FACTION_LABELS,
  formatUnit,
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
 */

const TOOL_SUGGESTIONS = [
  { id: "Read",      desc: "Read files" },
  { id: "Write",     desc: "Write files" },
  { id: "Edit",      desc: "Edit files" },
  { id: "Bash",      desc: "Run shell" },
  { id: "Grep",      desc: "Search code" },
  { id: "WebFetch",  desc: "Fetch URLs" },
  { id: "TodoWrite", desc: "Task list" },
  { id: "Task",      desc: "Spawn agents" },
];

const MODELS = [
  { id: "haiku",  name: "haiku",  full: MODEL_FULL["haiku"]!,  badge: "fast",  price: "$0.25/Mt", desc: "Light tasks, snappy. Good for orchestration." },
  { id: "sonnet", name: "sonnet", full: MODEL_FULL["sonnet"]!, badge: "smart", price: "$3.00/Mt", desc: "Balanced - the default for most agents." },
  { id: "opus",   name: "opus",   full: MODEL_FULL["opus"]!,   badge: "deep",  price: "$15/Mt", desc: "Hardest reasoning. Slow. Use sparingly." },
  { id: "fable",  name: "fable",  full: MODEL_FULL["fable"]!,  badge: "test",  price: "—",         desc: "Fable-5 — A/B test variant. Compare against Opus/Sonnet on the same task." },
] as const;

/** One color per model "tier" badge — drives both the badge pill and the
 *  card's top stripe, so a model's rank reads at a glance even before you
 *  read the badge text (each tier gets its own hue, not a generic accent). */
const MODEL_TIER: Record<string, { fg: string; bg: string; border: string }> = {
  fast:  { fg: "var(--working)", bg: "rgba(34,197,94,0.10)",   border: "rgba(34,197,94,0.30)" },
  smart: { fg: "#c792ea",        bg: "rgba(199,146,234,0.10)", border: "rgba(199,146,234,0.30)" },
  deep:  { fg: "#ffcb6b",        bg: "rgba(255,203,107,0.10)", border: "rgba(255,203,107,0.30)" },
  test:  { fg: "#7dd3fc",        bg: "rgba(125,211,252,0.10)", border: "rgba(125,211,252,0.30)" },
};

const CLASS_OPTIONS = ["Boardroom", "Engineering", "QA", "Design", "Strategy", "Product", "Other"];

const PM_ICONS: Record<(typeof PERMISSION_MODE_OPTS)[number], IconName> = {
  bypassPermissions: "play",
  default: "help-circle",
  plan: "slash",
};

/** i18n message-key stem per permission mode — see `agent_editor.permission_*_label/subtitle` in messages/en.json. */
const PM_MSG_KEY: Record<(typeof PERMISSION_MODE_OPTS)[number], "bypass" | "default" | "plan"> = {
  bypassPermissions: "bypass",
  default: "default",
  plan: "plan",
};

const FACTION_COLORS: Record<UnitFaction, string> = {
  blue: "#4a8fff",
  red: "#e8553a",
  purple: "#9c70d4",
  yellow: "#d4a832",
  black: "#888888",
};

const DESC_MAX = 240;

/* ── Section card ─────────────────────────────────────────────── */

function SectionCard({ n, title, sub, complete, children }: {
  n: string; title: string; sub: string; complete: boolean; children: React.ReactNode;
}) {
  return (
    <section className="bg-bg-2 border border-line overflow-hidden rounded-[14px]">
      <div className="na-section-head flex items-center border-b border-line gap-[12px] px-[18px] py-[14px]">
        <div className="flex items-center justify-center bg-acc-faint border text-acc font-bold shrink-0 w-[22px] h-[22px] rounded-[6px] border-[var(--acc-tint)] font-[var(--font-mono)] text-[11px]">{n}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-txt font-bold m-0 text-[14px]">{title}</h3>
          <div className="text-txt-3 font-[var(--font-mono)] text-[11.5px] mt-[2px]">{sub}</div>
        </div>
        <div className={`check${complete ? "" : " empty bg-transparent text-txt-4 border-[var(--line)]"}`}>
          {complete
            ? <Icon name="check" size={11} />
            : <span className="w-1 h-1 rounded-[2px] bg-current block" />}
        </div>
      </div>
      <div className="flex flex-col px-[20px] py-[18px] gap-[14px]">{children}</div>
    </section>
  );
}

/* ── Chip picker ──────────────────────────────────────────────── */

function ChipPicker({ chips, suggestions, onAdd, onRemove, placeholder }: {
  chips: string[];
  suggestions: Array<{ id: string; desc?: string }>;
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (val: string) => {
    const t = val.trim();
    if (t && !chips.includes(t)) onAdd(t);
    setInput("");
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) { e.preventDefault(); add(input); }
    if (e.key === "Backspace" && !input && chips.length > 0) onRemove(chips[chips.length - 1]!);
  };

  // Unfiltered, this list can run into the hundreds (e.g. every installed
  // skill) — dumping all of it as "suggested" chips is a wall, not a
  // suggestion. Filter by the in-progress query, and when there's no query
  // cap the idle list to a browsable handful with a "+N more" hint instead.
  const SUGGEST_CAP = 12;
  const query = input.trim().toLowerCase();
  const availableAll = suggestions.filter((s) => !chips.includes(s.id));
  const matched = query ? availableAll.filter((s) => s.id.toLowerCase().includes(query)) : availableAll;
  const available = query ? matched : matched.slice(0, SUGGEST_CAP);
  const hiddenCount = query ? 0 : Math.max(0, matched.length - SUGGEST_CAP);

  return (
    <>
      <div className="flex flex-wrap items-center bg-bg-1 border border-line rounded-[7px] gap-[5px] min-h-[38px] px-[8px] py-[5px] cursor-text focus-within:border-[var(--acc-tint)]" onClick={() => inputRef.current?.focus()}>
        {chips.map((chip) => (
          <span key={chip} className="inline-flex items-center bg-bg-3 border border-line text-txt gap-[5px] px-[6px] pr-[6px] py-[3px] rounded-[5px] text-[12px] font-[var(--font-mono)]">
            {chip}
            <button type="button" className="x bg-transparent border-none text-txt-4 cursor-pointer inline-flex items-center p-0 leading-none hover:text-[var(--error)]" onClick={(e) => { e.stopPropagation(); onRemove(chip); }} aria-label={`Remove ${chip}`}>
              <Icon name="x" size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="flex-1 bg-transparent border-none outline-none text-txt min-w-[80px] text-[12px] font-[inherit] py-[2px]"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => { if (input.trim()) add(input); }}
          placeholder={chips.length === 0 ? placeholder : "+ add"}
        />
      </div>
      {available.length > 0 && (
        <div className="flex flex-wrap items-center mt-[8px] gap-[6px]">
          <span className="text-txt-4 uppercase font-[var(--font-mono)] text-[10.5px] tracking-[0.08em] mr-[2px]">suggested</span>
          {available.map((s) => (
            <button key={s.id} type="button" className="suggest-chip inline-flex items-center bg-bg-1 border border-line rounded-full text-txt-2 cursor-pointer gap-[5px] px-[7px] py-[3px] pl-[9px] font-[var(--font-mono)] text-[11.5px] transition-[background,border-color] duration-[100ms] hover:bg-bg-3 hover:text-txt hover:border-line-2" onClick={() => onAdd(s.id)}>
              {s.id}
              <span className="text-txt-4 inline-flex"><Icon name="plus" size={10} /></span>
            </button>
          ))}
          {hiddenCount > 0 && (
            <span className="text-txt-4 font-[var(--font-mono)] text-[10.5px]">+{hiddenCount} more — type to search</span>
          )}
        </div>
      )}
    </>
  );
}

/* ── Class chips ──────────────────────────────────────────────── */
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

  return (
    <div className="flex flex-wrap items-center gap-[6px]">
      {CLASS_OPTIONS.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(value === opt ? "" : opt)}
          className={`inline-flex items-center px-[10px] py-[5px] rounded-full text-[11.5px] font-medium cursor-pointer border transition-[background,border-color,color] duration-[120ms] font-[inherit] ${
            value === opt
              ? "border-[var(--acc-tint)] bg-acc-faint text-acc"
              : "border-line bg-bg-1 text-txt-2 hover:bg-bg-3 hover:border-line-2"
          }`}
        >
          {opt}
        </button>
      ))}
      {isCustom && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="inline-flex items-center gap-[5px] px-[10px] py-[5px] rounded-full text-[11.5px] font-medium cursor-pointer border border-[var(--acc-tint)] bg-acc-faint text-acc font-[inherit]"
        >
          {value}
          <Icon name="x" size={10} />
        </button>
      )}
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
          className="bg-bg-1 border border-line rounded-full px-[10px] py-[5px] text-[11.5px] text-txt outline-none w-[110px] font-[inherit] focus:border-[var(--acc-tint)]"
        />
      ) : (
        <button
          type="button"
          onClick={() => setCustomOpen(true)}
          className="inline-flex items-center gap-[4px] px-[10px] py-[5px] rounded-full text-[11.5px] font-medium cursor-pointer border border-dashed border-line-2 bg-transparent text-txt-3 hover:bg-bg-2 hover:text-txt font-[inherit]"
        >
          <Icon name="plus" size={10} /> Add
        </button>
      )}
    </div>
  );
}

/* ── Permission mode shield badge ─────────────────────────────── */

function PermissionShield({ pm, active }: { pm: (typeof PERMISSION_MODE_OPTS)[number]; active: boolean }) {
  return (
    <span className="relative w-[26px] h-[29px] shrink-0 flex items-center justify-center" style={{ color: active ? "var(--acc)" : "var(--txt-4)" }}>
      <svg width="26" height="29" viewBox="0 0 24 26" className="absolute inset-0">
        <path
          d="M12 1 22 4.5V13c0 6.5-5.5 10-10 12C7.5 23 2 19.5 2 13V4.5z"
          fill={active ? "var(--acc-faint)" : "var(--bg-2)"}
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </svg>
      <span className="relative">
        <Icon name={PM_ICONS[pm]} size={11} />
      </span>
    </span>
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
  const skillChips = parseCsv(values.skills);
  const toolChips = parseCsv(values.tools);
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

  return (
    <div className={cn("flex flex-col min-h-0 relative", embedded ? "flex-1" : "h-full")}>
      {/* Header — full-page mode only. Embedded (modal tab) usage already
          has its own header with the agent's name/avatar/close button. */}
      {!embedded && (
        <header className="border-b border-line flex items-center shrink-0 px-[28px] py-[18px] gap-[16px]">
          <div>
            <div className="flex items-center text-txt-3 gap-[6px] font-[var(--font-mono)] text-[11.5px] mb-[4px]">
              <a className="text-txt-3 no-underline cursor-pointer hover:text-txt" onClick={() => router.push(PAGE_ROUTES.agents)}>Agents</a>
              <span className="text-txt-4">›</span>
              <span>{mode === "new" ? "Forge" : values.name || values.id}</span>
            </div>
            <h1 className="flex items-baseline text-txt font-bold m-0 text-[22px] tracking-[-0.01em] gap-[10px]">
              {mode === "new" ? "Forge agent" : "Edit agent"}
              <span className="text-txt-3 font-normal font-[var(--font-mono)] text-[12.5px] tracking-normal">
                {mode === "new" ? "· write a fresh markdown definition" : `· ~/.claude/agents/${values.id}.md`}
              </span>
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-[8px]">
            <div className="flex items-center bg-bg-2 border border-line rounded-full text-txt-2 gap-[10px] px-[14px] py-[5px] font-[var(--font-mono)] text-[11px]">
              <div className="rounded-full bg-bg-3 overflow-hidden w-[80px] h-[5px]">
                <div className="h-full bg-acc rounded-full transition-[width] duration-[300ms]" style={{ width: `${(completed / 4) * 100}%` }} />
              </div>
              <span>{completed}/4 ready</span>
            </div>
            <Button variant="ghost" onClick={() => (onCancel ? onCancel() : router.back())}>
              Cancel
            </Button>
          </div>
        </header>
      )}

      {/* Body — full page owns its own scroll (`overflow-y-auto`, bottom
          padding reserved for the floating save bar below). Embedded mode
          renders in normal flow instead: the modal tab's own container does
          the scrolling, and the save bar is a sticky trailing sibling. */}
      <div className={cn("flex items-start gap-[16px]", embedded ? "px-6 pt-5" : "flex-1 min-h-0 overflow-y-auto px-[28px] py-[24px] pb-[120px]")}>
        {/* Live preview column */}
        <aside className="flex flex-col sticky top-0 gap-[14px] w-[308px] shrink-0 max-[900px]:hidden">
          <div className="relative overflow-hidden rounded-[22px] surface-sheen shadow-[var(--lift)] px-[20px] pt-[22px] pb-[20px]">
            <div className="relative flex flex-col items-center">
              <div className="flex items-center justify-center w-[84px] h-[84px] mb-[10px]">
                <AgentAvatar unit={unit} size={64} label={values.name || "Agent avatar"} />
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

              <div className="w-full mt-[18px] pt-[16px] border-t border-line">
                <div className="text-txt-4 uppercase font-[var(--font-mono)] text-[9.5px] tracking-[0.08em] mb-[9px]">Faction</div>
                <div className="flex items-center gap-[7px]">
                  {UNIT_FACTIONS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      title={FACTION_LABELS[f]}
                      onClick={() => set("unit", formatUnit({ faction: f, kind: unit.kind }))}
                      className="w-[26px] h-[26px] rounded-[9px] cursor-pointer transition-transform duration-[140ms] hover:-translate-y-[2px]"
                      style={{
                        background: FACTION_COLORS[f],
                        boxShadow: unit.faction === f ? "0 0 0 2px var(--bg-2), 0 0 0 4px var(--acc)" : "none",
                      }}
                    />
                  ))}
                  <span className="flex-1" />
                  <button
                    type="button"
                    title="Reroll unit"
                    onClick={rerollUnit}
                    className="w-[26px] h-[26px] flex items-center justify-center rounded-[9px] bg-bg-1 border border-line-2 text-txt-3 hover:text-txt hover:border-line-2 transition-colors cursor-pointer"
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
                        className={`px-[11px] py-[6px] rounded-full text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-[background,color] duration-[140ms] ${
                          active ? "bg-acc-faint text-acc" : "bg-bg-1 text-txt-3 hover:bg-bg-3 hover:text-txt"
                        }`}
                      >
                        {UNIT_DEFS[k].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="w-full flex flex-wrap gap-[8px] mt-[16px]">
                <div className="bg-bg-2 border border-line px-[11px] py-[9px] rounded-[12px] flex-1 basis-[calc(50%-4px)]"><div className="text-txt-4 uppercase font-[var(--font-mono)] text-[9px] tracking-[0.07em]">Model</div><div className="text-txt font-semibold font-[var(--font-mono)] text-[12.5px] mt-[2px] truncate">{values.model || "-"}</div></div>
                <div className="bg-bg-2 border border-line px-[11px] py-[9px] rounded-[12px] flex-1 basis-[calc(50%-4px)]"><div className="text-txt-4 uppercase font-[var(--font-mono)] text-[9px] tracking-[0.07em]">Effort</div><div className="text-txt font-semibold font-[var(--font-mono)] text-[12.5px] mt-[2px] truncate">{values.effort || "-"}</div></div>
                <div className="bg-bg-2 border border-line px-[11px] py-[9px] rounded-[12px] flex-1 basis-[calc(50%-4px)]"><div className="text-txt-4 uppercase font-[var(--font-mono)] text-[9px] tracking-[0.07em]">Permission</div><div className="text-txt font-semibold font-[var(--font-mono)] text-[12.5px] mt-[2px] truncate">{PM_MSG_KEY[values.pm as keyof typeof PM_MSG_KEY] ? pmLabel(values.pm as keyof typeof PM_MSG_KEY) : (values.pm || "-")}</div></div>
                <div className="bg-bg-2 border border-line px-[11px] py-[9px] rounded-[12px] flex-1 basis-[calc(50%-4px)]"><div className="text-txt-4 uppercase font-[var(--font-mono)] text-[9px] tracking-[0.07em]">Tools</div><div className="text-txt font-semibold font-[var(--font-mono)] text-[12.5px] mt-[2px] truncate">{toolChips.length}</div></div>
              </div>
            </div>
          </div>

          {/* Tip */}
          <div className="tip-card border border-line text-txt-2 border-l-[3px] border-l-acc rounded-[10px] px-[14px] py-[12px] font-[var(--font-mono)] text-[11.5px] leading-[1.6]">
            <div className="flex items-center text-acc uppercase gap-[6px] tracking-[0.08em] text-[10.5px] mb-[4px]"><Icon name="help-circle" size={11} /> Tip</div>
            Agents with clear refusal rules ship better. Tell the model what it should{" "}
            <em>not</em> do.
          </div>
        </aside>

        {/* Main column */}
        <div className="flex flex-col flex-1 min-w-0 gap-[18px]">

          {/* Section 1 - Identity */}
          <SectionCard n="1" title="Identity" sub="how this agent is named and described" complete={sec1Done}>
            <div className="flex items-start gap-[18px]">
              <div className="flex flex-col items-center gap-[6px] w-[96px] shrink-0">
                <div className="flex items-center justify-center bg-bg-3 border border-line relative overflow-hidden w-[84px] h-[84px] rounded-[16px] [box-shadow:0_10px_30px_-10px_rgba(0,0,0,0.5)] before:content-[''] before:absolute before:inset-0 before:[background:radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.06),transparent_60%)] before:pointer-events-none">
                  <AgentAvatar unit={unit} size={56} label={values.name || "Agent avatar"} />
                </div>
                <button type="button" className="inline-flex items-center text-txt-3 cursor-pointer bg-transparent border-none font-[var(--font-mono)] text-[10.5px] gap-[4px] hover:text-acc" onClick={rerollUnit}>
                  <Icon name="refresh" size={11} /> auto
                </button>
              </div>

              <div className="flex flex-col gap-[14px] flex-1 min-w-0">
                <div className="flex flex-col gap-[5px]">
                  <label className="uppercase flex items-center text-txt-3 font-semibold text-[11px] tracking-[0.06em] gap-[5px] mb-[1px]">Name</label>
                  <div className={`flex items-center bg-bg-1 border border-line rounded-[7px] px-[10px] transition-[border-color] duration-[120ms] focus-within:border-[var(--acc-tint)]${errFor("name") ? " border-[var(--error)]" : ""}`}>
                    <input
                      className="flex-1 bg-transparent border-none outline-none text-txt text-[13px] font-[inherit] py-[9px]"
                      value={values.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        setValues((v) => ({ ...v, name, id: slugEdited ? v.id : slugifyId(name) }));
                      }}
                      placeholder="Frontend Pragmatist"
                      autoFocus={mode === "new"}
                    />
                  </div>
                  {errFor("name") && <span className="text-[11px] text-status-error">{errFor("name")}</span>}
                </div>

                <div className="flex flex-wrap gap-[14px]">
                  <div className="flex flex-col gap-[5px] flex-1 min-w-[160px]">
                    <label className="uppercase flex items-center text-txt-3 font-semibold text-[11px] tracking-[0.06em] gap-[5px] mb-[1px]">
                      ID (slug) {mode === "new" && <span className="text-acc">·</span>}
                    </label>
                    <div className={`flex items-center bg-bg-1 border border-line rounded-[7px] px-[10px] transition-[border-color] duration-[120ms] focus-within:border-[var(--acc-tint)]${errFor("id") ? " border-[var(--error)]" : ""}${mode === "edit" ? " opacity-60" : ""}`}>
                      <span className="text-txt-2 shrink-0 font-[var(--font-mono)] text-[11px] select-none">~/.claude/agents/</span>
                      <input
                        className="flex-1 bg-transparent border-none outline-none text-txt text-[12px] font-[var(--font-mono)] py-[9px]"
                        value={values.id || slug}
                        onChange={(e) => { setSlugEdited(true); set("id", e.target.value); }}
                        placeholder="my-agent"
                        disabled={mode === "edit"}
                        title={mode === "edit" ? "ID cannot be changed after creation" : undefined}
                      />
                      <span className="text-txt-2 shrink-0 font-[var(--font-mono)] text-[11px] select-none">.md</span>
                    </div>
                    {errFor("id") && <span className="text-[11px] text-status-error">{errFor("id")}</span>}
                  </div>

                  <div className="flex flex-col gap-[5px] flex-1 min-w-[160px]">
                    <label className="uppercase flex items-center text-txt-3 font-semibold text-[11px] tracking-[0.06em] gap-[5px] mb-[1px] justify-between">
                      <span>Description</span>
                      <span className={`font-normal normal-case tracking-[0] ${values.desc.length > DESC_MAX ? "text-status-error" : "text-txt-4"}`}>
                        {values.desc.length}/{DESC_MAX}
                      </span>
                    </label>
                    <div className={`flex items-center bg-bg-1 border border-line rounded-[7px] px-[10px] transition-[border-color] duration-[120ms] focus-within:border-[var(--acc-tint)]${errFor("desc") ? " border-[var(--error)]" : ""}`}>
                      <input
                        className="flex-1 bg-transparent border-none outline-none text-txt text-[13px] font-[inherit] py-[9px]"
                        value={values.desc}
                        onChange={(e) => set("desc", e.target.value)}
                        placeholder="One-line description of when to summon this agent."
                        maxLength={DESC_MAX + 20}
                      />
                    </div>
                    <div className="text-txt-3 text-[11px] mt-[1px]">{values.desc.length} / {DESC_MAX} chars - keep it to a sentence</div>
                    {errFor("desc") && <span className="text-[11px] text-status-error">{errFor("desc")}</span>}
                  </div>
                </div>

                <div className="flex flex-col gap-[5px]">
                  <label className="uppercase flex items-center text-txt-3 font-semibold text-[11px] tracking-[0.06em] gap-[5px] mb-[1px]">Class</label>
                  <ClassPicker value={values.room} onChange={(v) => set("room", v)} />
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Section 2 - Runtime */}
          <SectionCard n="2" title="Runtime" sub="model, effort, and execution policy" complete={sec2Done}>
            {/* Model */}
            <div className="flex flex-col gap-[5px]">
              <label className="uppercase flex items-center text-txt-3 font-semibold text-[11px] tracking-[0.06em] gap-[5px] mb-[1px]">Model</label>
              <div className="model-cards flex flex-wrap gap-[8px]">
                {MODELS.map((m) => {
                  const tier = MODEL_TIER[m.badge]!;
                  const active = values.model === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`model-card text-left bg-bg-1 border border-line cursor-pointer flex flex-col flex-1 basis-[160px] min-w-[160px] rounded-[10px] overflow-hidden transition-[background,border-color] duration-[120ms] font-[inherit] hover:bg-bg-3 hover:border-line-2${active ? " active border-[var(--acc-tint)] [box-shadow:inset_0_0_0_1px_var(--acc-tint)]" : ""}`}
                      onClick={() => set("model", m.id)}
                    >
                      <span className="block h-[4px] w-full shrink-0" style={{ background: tier.fg }} aria-hidden />
                      <span className="flex flex-col gap-[4px] px-[14px] py-[10px]">
                        <span className={`row1 flex items-center gap-[8px] font-bold text-[14px]${active ? " text-acc" : " text-txt"}`}>
                          {m.name}
                          <span className="ml-auto rounded-full border font-[var(--font-mono)] text-[10px] px-[6px] py-[1px] tracking-[0.04em]" style={{ background: tier.bg, borderColor: tier.border, color: tier.fg }}>{m.badge}</span>
                        </span>
                        <span className="text-txt-3 font-[var(--font-mono)] text-[11px]">{m.full} · {m.price}</span>
                        <span className={`text-[11.5px] leading-[1.5]${active ? " desc" : " text-txt-3"}`}>{m.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Effort */}
            <div className="flex flex-col gap-[5px]">
              <div className="flex items-center mb-[1px]">
                <label className="uppercase flex items-center text-txt-3 font-semibold text-[11px] tracking-[0.06em] gap-[5px]">Effort</label>
                <span className="flex-1" />
                <span className="text-txt-4 text-[10.5px]">higher effort → more thinking tokens before responding</span>
              </div>
              <div className="effort-slider relative px-[22px] pt-[19px] pb-[13px] rounded-[15px] bg-bg-1 border border-line">
                <div className="absolute left-[22px] right-[22px] top-[27px] h-[3px] rounded-full bg-bg-3">
                  <div
                    className="h-full rounded-full transition-[width] duration-200"
                    style={{
                      width: `${(EFFORT_OPTS.findIndex((id) => id === values.effort) / (EFFORT_OPTS.length - 1)) * 100}%`,
                      background: "linear-gradient(90deg,var(--acc-2),var(--acc))",
                      boxShadow: "0 0 10px 1px rgba(139,123,255,0.6)",
                    }}
                  />
                </div>
                <div className="relative flex items-start justify-between">
                  {EFFORT_OPTS.map((id) => {
                    const active = values.effort === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => set("effort", id)}
                        className="flex flex-col items-center gap-[9px] cursor-pointer bg-transparent border-none p-0 font-[inherit]"
                      >
                        <span
                          className="w-[18px] h-[18px] rounded-full flex items-center justify-center transition-[background,box-shadow] duration-150"
                          style={{
                            background: active ? "var(--acc)" : "var(--bg-3)",
                            boxShadow: active ? "0 0 0 4px var(--acc-tint)" : "inset 0 0 0 1px var(--line-2)",
                          }}
                        >
                          {active && <span className="w-[6px] h-[6px] rounded-full bg-white" />}
                        </span>
                        <span className={`font-[var(--font-mono)] text-[11px]${active ? " font-bold text-acc" : " text-txt-3"}`}>{id}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Permission */}
            <div className="flex flex-col gap-[5px]">
              <label className="uppercase flex items-center text-txt-3 font-semibold text-[11px] tracking-[0.06em] gap-[5px] mb-[1px]">Permission mode</label>
              <div className="permission-seg flex flex-wrap gap-[9px]">
                {PERMISSION_MODE_OPTS.map((pm) => {
                  const active = values.pm === pm;
                  return (
                    <button
                      key={pm}
                      type="button"
                      className={`flex items-center flex-1 basis-[160px] min-w-[160px] text-left cursor-pointer bg-bg-1 border border-line gap-[11px] px-[13px] py-[11px] rounded-[14px] transition-transform duration-150 font-[inherit] hover:-translate-y-px${active ? " border-[var(--acc-tint)] [box-shadow:inset_0_0_0_1px_var(--acc-tint)]" : ""}`}
                      onClick={() => set("pm", pm)}
                    >
                      <PermissionShield pm={pm} active={active} />
                      <span className="flex flex-col min-w-0">
                        <span className={`font-semibold text-[12.5px] whitespace-nowrap${active ? " text-acc" : " text-txt"}`}>{pmLabel(pm)}</span>
                        <span className="font-[var(--font-mono)] text-[10px] text-txt-4 mt-[2px] whitespace-nowrap overflow-hidden text-ellipsis">{pmSubtitle(pm)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </SectionCard>

          {/* Section 3 - Capabilities */}
          <SectionCard
            n="3"
            title="Capabilities"
            sub={`${skillChips.length} skills · ${toolChips.length} tools`}
            complete={sec3Done}
          >
            <div className="flex flex-col gap-[5px]">
              <label className="uppercase flex items-center text-txt-3 font-semibold text-[11px] tracking-[0.06em] gap-[5px] mb-[1px]"><Icon name="layers" size={11} /> Skills</label>
              <ChipPicker
                chips={skillChips}
                suggestions={skillSuggestions}
                onAdd={(v) => set("skills", toCsv([...skillChips, v]))}
                onRemove={(v) => set("skills", toCsv(skillChips.filter((c) => c !== v)))}
                placeholder="add a skill - frontend-design, research…"
              />
            </div>
            <div className="flex flex-col gap-[5px]">
              <label className="uppercase flex items-center text-txt-3 font-semibold text-[11px] tracking-[0.06em] gap-[5px] mb-[1px]"><Icon name="hammer" size={11} /> Tools allowed</label>
              <ChipPicker
                chips={toolChips}
                suggestions={TOOL_SUGGESTIONS}
                onAdd={(v) => set("tools", toCsv([...toolChips, v]))}
                onRemove={(v) => set("tools", toCsv(toolChips.filter((c) => c !== v)))}
                placeholder="add a tool"
              />
            </div>
          </SectionCard>

          {/* Section 4 - System prompt */}
          <SectionCard
            n="4"
            title="System prompt"
            sub={`markdown body · ${values.body.length.toLocaleString()} chars · ~${Math.round(values.body.length / 4)} tokens`}
            complete={sec4Done}
          >
            <CodeEditor
              value={values.body}
              onChange={(v) => set("body", v)}
              placeholder="Write your system prompt here…"
              minHeight={220}
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

      {/* Save bar — floats above the viewport bottom on a full page (the
          scroll area above reserves `pb-[120px]` for it); a normal sticky
          trailing sibling when embedded, matching how the rest of the app's
          modal tabs pin their save bars to the tab's own scroll container. */}
      {embedded ? (
        <div className="sticky bottom-0 flex items-center gap-[14px] px-6 py-[14px] bg-bg-1 border-t border-line mt-4 -mx-6 shrink-0">
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
              <Icon name="check" size={13} />
              {isPending ? "Saving…" : "Save changes"}
              <span className="inline-block bg-bg-1 text-txt-2 px-[5px] py-[1px] border border-b-2 border-line-2 rounded font-mono text-[10.5px]">⌘ S</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="absolute flex items-center pointer-events-none left-0 right-0 bottom-0 px-[28px] py-[14px] z-[4] [background:linear-gradient(180deg,transparent,var(--bg-0)_22%)]">
          <div className="flex-1 flex items-center bg-bg-2 border border-line-2 pointer-events-auto gap-[14px] px-[18px] py-[12px] rounded-[14px] [box-shadow:0_14px_40px_-10px_rgba(0,0,0,0.5)]">
            {mode === "edit" && (
              <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleteMut.isPending}>
                <Icon name="x" size={12} /> Delete
              </Button>
            )}
            <span className="inline-flex items-center shrink-0 gap-[8px] font-[var(--font-mono)] text-[12px] text-[#f59e0b]">
              {dirtyCount > 0 && <span className="w-[6px] h-[6px] rounded-full bg-[#f59e0b] [box-shadow:0_0_8px_#f59e0b] animate-[pulse_1.4s_infinite]" />}
              {dirtyCount > 0 ? `${dirtyCount} unsaved field${dirtyCount !== 1 ? "s" : ""}` : "No changes"}
            </span>
            <span className="text-txt-4 flex-1 font-[var(--font-mono)] text-[11px]">
              will write to <code className="text-txt-2 bg-bg-3 border border-line px-[5px] py-[1px] rounded-[4px]">~/.claude/agents/{slug || "…"}.md</code>
            </span>
            <div className="ml-auto flex gap-[8px]">
              {dirtyCount > 0 && mode === "edit" && (
                <Button variant="ghost" onClick={handleDiscard} disabled={isPending}>
                  <Icon name="refresh" size={12} /> Revert
                </Button>
              )}
              <Button variant="ghost" onClick={() => (onCancel ? onCancel() : router.back())} disabled={isPending}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSubmit} disabled={isPending}>
                <Icon name="check" size={13} />
                {isPending ? (mode === "new" ? "Creating…" : "Saving…") : mode === "new" ? "Create agent" : "Save changes"}
                <span className="inline-block bg-bg-1 text-txt-2 px-[5px] py-[1px] border border-b-2 border-line-2 rounded font-mono text-[10.5px]">⌘ S</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
