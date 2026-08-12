"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgent, useAgentBody, useWriteAgent, useDeleteAgent } from "@/modules/agents/hooks/use-agents";
import { fromApi, toBody, type AgentFormValues } from "@/modules/agents/form/agent-form";
import { useAgentForm } from "@/modules/agents/hooks/use-agent-form";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { MODEL_OPTS, EFFORT_OPTS } from "@agent-office/domain";
import { Icon } from "@/components/ui/icon";
import { UnitPicker } from "@/components/ui/unit-picker";
import { useSkillManifest, useSkillCompatibility, type SkillManifestEntry } from "@/modules/skills/hooks/use-skills";
import { BodyHistoryPanel } from "@/modules/agents/components/body-history-panel";
import { findActiveConflicts } from "./settings-tab/skill-format";
import { SkillConflictWarning } from "./settings-tab/skill-conflict-warning";
import { SkillCostPill } from "./settings-tab/skill-cost-pill";
import { SkillAutocompleteInput } from "./settings-tab/skill-autocomplete-input";
import { SelectField } from "./settings-tab/select-field";
import { MarkdownPreview } from "./settings-tab/markdown-preview";
import { iconForTool } from "./settings-tab/tool-icon";
import { highlightMd } from "@/components/ui/code-editor";
export function SettingsTab({
  agentId,
  onAfterSave,
  onAfterDelete,
  resetRef,
}: {
  agentId: string;
  onAfterSave: () => void;
  onAfterDelete: () => void;
  resetRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const agentQ = useAgent(agentId);
  const bodyQ = useAgentBody(agentId);
  const qc = useQueryClient();
  const writeMut = useWriteAgent();
  const deleteMut = useDeleteAgent();

  const [formKey, setFormKey] = useState(0);

  if (agentQ.isLoading || bodyQ.isLoading) {
    return (
      <div className="px-6 pt-5 pb-6 flex-1 flex flex-col">
        <Skeleton width="100%" height={240} />
      </div>
    );
  }
  if (!agentQ.data) {
    return (
      <div className="px-6 pt-5 pb-6 flex-1 flex flex-col text-ao-fg-2 p-[18px]">
        Failed to load agent settings.
      </div>
    );
  }

  const initialValues = fromApi(agentQ.data, bodyQ.data ?? "");

  return (
    <SettingsForm
      key={formKey}
      initial={initialValues}
      agentId={agentId}
      resetRef={resetRef}
      onSave={async (values) => {
        const body = toBody(values);
        await writeMut.mutateAsync(body);
        qc.invalidateQueries({ queryKey: queryKeys.agents.all });
        qc.invalidateQueries({ queryKey: queryKeys.agents.detail(agentId) });
        qc.invalidateQueries({ queryKey: queryKeys.agents.body(agentId) });
        setFormKey((k) => k + 1);
        onAfterSave();
      }}
      onDelete={async () => {
        if (!window.confirm(`Delete agent "${agentId}"? This cannot be undone.`)) return;
        await deleteMut.mutateAsync(agentId);
        qc.invalidateQueries({ queryKey: queryKeys.agents.all });
        onAfterDelete();
      }}
      saving={writeMut.isPending}
      deleting={deleteMut.isPending}
    />
  );
}

function SettingsForm({
  initial,
  agentId,
  onSave,
  onDelete,
  saving,
  deleting,
  resetRef,
}: {
  initial: AgentFormValues;
  agentId: string;
  onSave: (values: AgentFormValues) => Promise<void>;
  onDelete: () => Promise<void>;
  saving: boolean;
  deleting: boolean;
  resetRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const {
    v, setV,
    errors,
    serverError,
    view, setView,
    skillInput, setSkillInput,
    toolInput, setToolInput,
    dirty,
    skills,
    tools,
    set,
    setSkills,
    setTools,
    addSkill,
    addTool,
    handleSave,
    handleDiscard,
  } = useAgentForm(initial, onSave);

  const [historyOpen, setHistoryOpen] = useState(false);

  const manifestQ = useSkillManifest();
  const compatQ = useSkillCompatibility();
  const skillManifestBySlug: Record<string, SkillManifestEntry> = (() => {
    const entries = manifestQ.data?.skills ?? [];
    const out: Record<string, SkillManifestEntry> = {};
    for (const s of entries) out[s.slug] = s;
    return out;
  })();
  const activeConflicts = findActiveConflicts(skills, compatQ.data);

  useEffect(() => {
    if (resetRef) resetRef.current = handleDiscard;
  }, [resetRef, handleDiscard]);

  const promptLines = v.body.split("\n");
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const [promptH, setPromptH] = useState(320);

  // Measure both the highlight <pre> and the <textarea> after each body
  // change. Both share the AO_LAYER style + content, but their content
  // rendering can differ slightly (escaped entities, trailing newline
  // handling) so we take the max + a small safety pad. This keeps the
  // textarea from needing its own scroll, which would steal wheel events.
  useLayoutEffect(() => {
    const pre = preRef.current;
    const ta = taRef.current;
    const preH = pre?.scrollHeight ?? 0;
    const taH = ta?.scrollHeight ?? 0;
    const measured = Math.max(preH, taH);
    setPromptH(Math.max(320, measured + 8));
  }, [v.body]);

  const AO_LAYER: React.CSSProperties = {
    position: "absolute",
    top: 0, right: 0, bottom: 0, left: 0,
    margin: 0,
    padding: "12px 14px",
    fontFamily: "var(--ao-font-mono)",
    fontSize: "12.5px",
    lineHeight: "1.6",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "break-word",
    tabSize: 2,
    overflow: "hidden",
  };

  const AVAIL_TOOLS = ["Read", "Write", "Edit", "Bash", "WebFetch", "WebSearch", "Agent"];

  return (
    <div className="px-6 pt-5 pb-6 flex-1 flex flex-col">
      {/* ── Identity section ── */}
      <div className="mb-[var(--ao-gap-section)]">
        <div className="flex items-center gap-[10px] px-1 pb-[10px]">
          <span className="w-1 h-[14px] rounded-[2px] bg-[var(--ao-accent)] shrink-0" />
          <h3 className="m-0 text-[13px] font-semibold text-ao-fg-0 uppercase tracking-[0.08em]">Identity</h3>
          <span className="ml-auto text-ao-fg-2 font-mono text-[11.5px]">how this agent is named and described</span>
        </div>
        <div className="bg-ao-bg-2 border border-ao-line-1 rounded-ao-lg overflow-hidden">
          <div className="flex items-center gap-[10px] px-[var(--ao-pad-card)] py-[14px] border-b border-[var(--ao-line-0)]">
            <div className="w-[28px] h-[28px] flex items-center justify-center rounded-[8px] bg-ao-bg-3 border border-ao-line-1 text-ao-fg-1 shrink-0"><Icon name="identity" size={15} /></div>
            <div className="text-[13px] font-semibold tracking-[0.02em] text-ao-fg-0">Basic info</div>
          </div>
          <div className="p-[var(--ao-pad-card)]">
            <div className="flex flex-row max-[760px]:flex-col gap-[var(--ao-gap-section)]">
              <div className="flex flex-col gap-[6px] flex-1 basis-0">
                <label className="text-[10.5px] uppercase tracking-[0.1em] text-ao-fg-2 font-mono flex items-center gap-2">Name</label>
                <div className="flex items-center gap-2 px-3 py-[10px] bg-ao-bg-4 border border-ao-line-1 rounded-ao-md text-ao-fg-0 text-[13.5px] transition-[border-color,box-shadow] duration-[120ms] focus-within:border-ao-accent-line focus-within:[box-shadow:0_0_0_3px_var(--ao-accent-softer)]">
                  <input value={v.name} onChange={set("name")} placeholder="My Agent" className="flex-1 bg-transparent border-0 outline-none w-full text-ao-fg-0 text-[13.5px]" />
                </div>
              </div>
              <div className="flex flex-col gap-[6px] flex-1 basis-0">
                <label className="text-[10.5px] uppercase tracking-[0.1em] text-ao-fg-2 font-mono flex items-center gap-2">ID (slug) <span className="text-ao-accent">·</span></label>
                <div className="flex items-center gap-2 px-3 py-[10px] bg-ao-bg-4 border border-ao-line-1 rounded-ao-md text-ao-fg-0 text-[13.5px] transition-[border-color,box-shadow] duration-[120ms] focus-within:border-ao-accent-line focus-within:[box-shadow:0_0_0_3px_var(--ao-accent-softer)] font-mono">
                  <span className="text-ao-fg-1 font-mono text-[12px]">~/.claude/agents/</span>
                  <input value={v.id} disabled title="ID cannot be changed after creation" className="flex-1 bg-transparent border-0 outline-none w-full text-ao-fg-0 text-[13.5px] font-mono text-[12.5px]" />
                  <span className="text-ao-fg-1 font-mono text-[12px]">.md</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-[6px] mt-3">
              <label className="text-[10.5px] uppercase tracking-[0.1em] text-ao-fg-2 font-mono flex items-center gap-2">Description</label>
              <div className="px-3 py-[10px] bg-ao-bg-4 border border-ao-line-1 rounded-ao-md text-ao-fg-0 text-[13.5px] transition-[border-color,box-shadow] duration-[120ms] focus-within:border-ao-accent-line focus-within:[box-shadow:0_0_0_3px_var(--ao-accent-softer)]">
                <textarea rows={3} value={v.desc} onChange={set("desc")} placeholder="One-sentence description…" className="w-full bg-transparent border-0 outline-none resize-none text-ao-fg-0 text-[13.5px] leading-[1.5]" />
              </div>
              <div className="text-[11.5px] text-ao-fg-2 font-mono">{v.desc.length} / 240 chars</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Runtime section ── */}
      <div className="mb-[var(--ao-gap-section)]">
        <div className="flex items-center gap-[10px] px-1 pb-[10px]">
          <span className="w-1 h-[14px] rounded-[2px] bg-[var(--ao-accent)] shrink-0" />
          <h3 className="m-0 text-[13px] font-semibold text-ao-fg-0 uppercase tracking-[0.08em]">Runtime</h3>
          <span className="ml-auto text-ao-fg-2 font-mono text-[11.5px]">model and execution policy</span>
        </div>
        <div className="bg-ao-bg-2 border border-ao-line-1 rounded-ao-lg overflow-hidden">
          <div className="flex items-center gap-[10px] px-[var(--ao-pad-card)] py-[14px] border-b border-[var(--ao-line-0)]">
            <div className="w-[28px] h-[28px] flex items-center justify-center rounded-[8px] bg-ao-bg-3 border border-ao-line-1 text-ao-fg-1 shrink-0"><Icon name="cpu" size={15} /></div>
            <div className="text-[13px] font-semibold tracking-[0.02em] text-ao-fg-0">Execution</div>
          </div>
          <div className="p-[var(--ao-pad-card)]">
            <div className="flex flex-row max-[760px]:flex-col gap-[var(--ao-gap-section)]">
              <div className="flex flex-col gap-[6px] flex-1 basis-0">
                <label className="text-[10.5px] uppercase tracking-[0.1em] text-ao-fg-2 font-mono flex items-center gap-2">Model</label>
                <div className="flex items-center gap-2 px-3 py-[10px] bg-ao-bg-4 border border-ao-line-1 rounded-ao-md text-ao-fg-0 text-[13.5px] transition-[border-color,box-shadow] duration-[120ms]">
                  <SelectField
                    value={v.model}
                    onChange={(val) => setV((p) => ({ ...p, model: val }))}
                    options={MODEL_OPTS}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-[6px] flex-1 basis-0">
                <label className="text-[10.5px] uppercase tracking-[0.1em] text-ao-fg-2 font-mono flex items-center gap-2">Effort</label>
                <div className="flex items-center gap-2 px-3 py-[10px] bg-ao-bg-4 border border-ao-line-1 rounded-ao-md text-ao-fg-0 text-[13.5px] transition-[border-color,box-shadow] duration-[120ms]">
                  <SelectField
                    value={v.effort}
                    onChange={(val) => setV((p) => ({ ...p, effort: val }))}
                    options={EFFORT_OPTS}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-[6px] mt-[14px]">
              <label className="text-[10.5px] uppercase tracking-[0.1em] text-ao-fg-2 font-mono flex items-center gap-2">Permission mode</label>
              <div className="flex gap-[6px] p-1 bg-ao-bg-4 border border-ao-line-1 rounded-ao-md">
                {(["auto", "ask", "plan"] as const).map((mode) => {
                  const labels = { auto: "Auto", ask: "Ask", plan: "Plan" };
                  const hints  = { auto: "trust all tool calls", ask: "prompt on destructive ops", plan: "read-only mode" };
                  const active = v.pm === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setV((p) => ({ ...p, pm: mode }))}
                      className={`px-3 py-2 rounded-[8px] text-[12.5px] flex flex-col items-start gap-0.5 text-left transition-[background,box-shadow] duration-[120ms] flex-1 basis-0 ${
                        active
                          ? "bg-[var(--ao-accent-soft)] [box-shadow:inset_0_0_0_1.5px_var(--ao-accent)]"
                          : "text-ao-fg-1 hover:bg-ao-bg-3"
                      }`}
                    >
                      <span className={`font-semibold ${active ? "text-[var(--ao-accent)]" : "text-ao-fg-1"}`}>{labels[mode]}</span>
                      <span className={`text-[10.5px] font-mono tracking-[0.02em] ${active ? "text-[color-mix(in_oklab,var(--ao-accent)_70%,var(--ao-fg-1))]" : "text-ao-fg-2"}`}>{hints[mode]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-[6px] mt-[14px]">
              <label className="text-[10.5px] uppercase tracking-[0.1em] text-ao-fg-2 font-mono flex items-center gap-2">Room <span className="text-ao-fg-2 normal-case tracking-[0] font-[var(--ao-font-sans)] font-normal">· optional</span></label>
              <div className="flex items-center gap-2 px-3 py-[10px] bg-ao-bg-4 border border-ao-line-1 rounded-ao-md text-ao-fg-0 text-[13.5px] transition-[border-color,box-shadow] duration-[120ms] focus-within:border-ao-accent-line focus-within:[box-shadow:0_0_0_3px_var(--ao-accent-softer)]">
                <input value={v.room} onChange={set("room")} placeholder="e.g. Build" className="flex-1 bg-transparent border-0 outline-none w-full text-ao-fg-0 text-[13.5px]" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Capabilities section ── */}
      <div className="mb-[var(--ao-gap-section)]">
        <div className="flex items-center gap-[10px] px-1 pb-[10px]">
          <span className="w-1 h-[14px] rounded-[2px] bg-[var(--ao-accent)] shrink-0" />
          <h3 className="m-0 text-[13px] font-semibold text-ao-fg-0 uppercase tracking-[0.08em]">Capabilities</h3>
          <span className="ml-auto text-ao-fg-2 font-mono text-[11.5px]">{skills.length} skills · {tools.length} tools</span>
        </div>
        <div className="bg-ao-bg-2 border border-ao-line-1 rounded-ao-lg overflow-hidden">
          <div className="flex items-center gap-[10px] px-[var(--ao-pad-card)] py-[14px] border-b border-[var(--ao-line-0)]">
            <div className="w-[28px] h-[28px] flex items-center justify-center rounded-[8px] bg-ao-bg-3 border border-ao-line-1 text-ao-fg-1 shrink-0"><Icon name="wrench" size={15} /></div>
            <div className="text-[13px] font-semibold tracking-[0.02em] text-ao-fg-0">Skills &amp; tools</div>
          </div>
          <div className="p-[var(--ao-pad-card)]">
            <div className="flex flex-col gap-[6px]">
              <label className="text-[10.5px] uppercase tracking-[0.1em] text-ao-fg-2 font-mono flex items-center gap-2"><Icon name="sparkle" size={11} /> Skills</label>
              <SkillConflictWarning conflicts={activeConflicts} />
              <div
                data-skill-chip-container
                className="flex flex-wrap gap-[6px] p-[6px] pl-[10px] bg-ao-bg-4 border border-ao-line-1 rounded-ao-md min-h-[38px] items-center focus-within:border-[var(--ao-accent-line)] focus-within:[box-shadow:0_0_0_3px_var(--ao-accent-softer)]"
              >
                {/*
                 * Chip anatomy: [slug] [cost] [×]
                 * - Squircle radius (6px) instead of full round — less bubblegum,
                 *   more control-panel. Aligns with the input container.
                 * - Cost pill lives inline, right of the slug, using the same
                 *   tier styling as dropdown rows for consistency.
                 * - Remove button is a subtle icon-only affordance that
                 *   brightens on hover — no floating pill-inside-pill look.
                 */}
                {skills.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-[6px] h-[24px] pl-[9px] pr-[4px] bg-[var(--ao-accent-soft)] [box-shadow:inset_0_0_0_1px_var(--ao-accent-line)] rounded-[6px] font-mono text-[12px] text-[var(--ao-accent)]"
                  >
                    <span className="leading-none">{s}</span>
                    <SkillCostPill entry={skillManifestBySlug[s]} />
                    <button
                      type="button"
                      className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-[4px] text-current opacity-50 hover:opacity-100 hover:bg-white/[0.08] transition-opacity duration-100"
                      onClick={() => setSkills(skills.filter((x) => x !== s))}
                      aria-label={`remove ${s}`}
                    >
                      <Icon name="x" size={10} />
                    </button>
                  </span>
                ))}
                <SkillAutocompleteInput
                  value={skillInput}
                  onChange={setSkillInput}
                  selected={skills}
                  onAdd={(slug) => { if (!skills.includes(slug)) setSkills([...skills, slug]); }}
                  onRemove={(slug) => setSkills(skills.filter((x) => x !== slug))}
                  onFreeTextCommit={addSkill}
                  manifest={manifestQ.data?.skills ?? []}
                  loading={manifestQ.isLoading}
                  hasChips={skills.length > 0}
                />
              </div>
              <div className="text-[11.5px] text-ao-fg-2 font-mono">type to search · enter to add · ↑↓ to navigate</div>
            </div>

            <div className="flex flex-col gap-[6px] mt-[14px]">
              <label className="text-[10.5px] uppercase tracking-[0.1em] text-ao-fg-2 font-mono flex items-center gap-2"><Icon name="wrench" size={11} /> Tools allowed</label>
              <div className="flex flex-wrap gap-[6px] p-[6px] pl-[10px] bg-ao-bg-4 border border-ao-line-1 rounded-ao-md min-h-[38px] items-center focus-within:border-[var(--ao-accent-line)] focus-within:[box-shadow:0_0_0_3px_var(--ao-accent-softer)]">
                {tools.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-[6px] h-[24px] pl-[9px] pr-[4px] bg-ao-bg-3 [box-shadow:inset_0_0_0_1px_var(--ao-line-1)] rounded-[6px] font-mono text-[12px] text-ao-fg-0"
                  >
                    <span className="text-ao-fg-2 leading-none">{iconForTool(t)}</span>
                    <span className="leading-none">{t}</span>
                    <button
                      type="button"
                      className="w-[18px] h-[18px] flex items-center justify-center rounded-[4px] text-current opacity-50 hover:opacity-100 hover:bg-white/[0.08] transition-opacity duration-100"
                      onClick={() => setTools(tools.filter((x) => x !== t))}
                      aria-label={`remove ${t}`}
                    >
                      <Icon name="x" size={10} />
                    </button>
                  </span>
                ))}
                <input
                  className="bg-transparent border-0 outline-none flex-1 min-w-[100px] text-ao-fg-0 font-mono text-[12.5px] placeholder:text-ao-fg-1"
                  placeholder="+ add tool"
                  value={toolInput}
                  onChange={(e) => setToolInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTool(); } }}
                />
              </div>
              {/* Suggested tools: dashed-outline chips that read as
                  "empty slot, click to add" — distinguishes them from
                  active tool chips above without inventing a new shape. */}
              <div className="mt-2 flex flex-wrap gap-[6px] items-center">
                <span className="text-ao-fg-3 font-mono text-[11px] uppercase tracking-[0.06em]">Suggested</span>
                {AVAIL_TOOLS.filter((t) => !tools.includes(t)).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="inline-flex items-center gap-[6px] h-[24px] px-[9px] rounded-[6px] bg-transparent [box-shadow:inset_0_0_0_1px_var(--ao-line-1)] text-ao-fg-1 text-[12px] font-mono cursor-pointer hover:bg-ao-bg-3 hover:text-ao-fg-0 transition-[background-color,color] duration-[120ms]"
                    onClick={() => setTools([...tools, t])}
                  >
                    <span className="text-ao-fg-3 leading-none">{iconForTool(t)}</span>
                    <span className="leading-none">{t}</span>
                    <Icon name="plus" size={10} className="text-ao-fg-3 opacity-70" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Appearance section ── */}
      <div className="mb-[var(--ao-gap-section)]">
        <div className="flex items-center gap-[10px] px-1 pb-[10px]">
          <span className="w-1 h-[14px] rounded-[2px] bg-[var(--ao-accent)] shrink-0" />
          <h3 className="m-0 text-[13px] font-semibold text-ao-fg-0 uppercase tracking-[0.08em]">Appearance</h3>
          <span className="ml-auto text-ao-fg-2 font-mono text-[11.5px]">avatar shown in the office floor and sidebar</span>
        </div>
        <div className="bg-ao-bg-2 border border-ao-line-1 rounded-ao-lg overflow-hidden">
          <div className="flex items-center gap-[10px] px-[var(--ao-pad-card)] py-[14px] border-b border-[var(--ao-line-0)]">
            <div className="w-[28px] h-[28px] flex items-center justify-center rounded-[8px] bg-ao-bg-3 border border-ao-line-1 text-ao-fg-1 shrink-0"><Icon name="identity" size={15} /></div>
            <div className="text-[13px] font-semibold tracking-[0.02em] text-ao-fg-0">Avatar</div>
            <span className="ml-auto text-[11.5px] font-mono text-ao-fg-3">{v.unit ? "custom selection" : "auto from name"}</span>
          </div>
          <div className="p-[var(--ao-pad-card)]">
            <UnitPicker
              value={v.unit}
              onChange={(val) => setV((p) => ({ ...p, unit: val }))}
              agentName={v.name}
            />
          </div>
        </div>
      </div>

      {/* ── System prompt section ── */}
      <div className="mb-[var(--ao-gap-section)]">
        <div className="flex items-center gap-[10px] px-1 pb-[10px]">
          <span className="w-1 h-[14px] rounded-[2px] bg-[var(--ao-accent)] shrink-0" />
          <h3 className="m-0 text-[13px] font-semibold text-ao-fg-0 uppercase tracking-[0.08em]">System prompt</h3>
          <span className="ml-auto text-ao-fg-2 font-mono text-[11.5px]">
            markdown body · {v.body.length.toLocaleString()} chars · ~{Math.round(v.body.length / 4)} tokens
          </span>
        </div>

        <div className="ao-markdown-editor bg-ao-bg-4 border border-ao-line-1 rounded-[var(--ao-radius-md)] overflow-hidden">
          {/* ── Toolbar ── */}
          <div className="flex items-center gap-[6px] px-[8px] py-[7px] bg-[rgba(0,0,0,0.22)] border-b border-[var(--ao-line-0)]">
            {/* View tab switcher */}
            <div className="flex items-center gap-[2px] p-[3px] bg-[rgba(0,0,0,0.28)] rounded-[7px]">
              <button
                type="button"
                onClick={() => setView("write")}
                className={`inline-flex items-center gap-[5px] px-[10px] py-[4px] rounded-[5px] font-mono text-[11.5px] transition-[background,color,box-shadow] duration-[100ms] ${
                  view === "write"
                    ? "bg-ao-bg-2 text-ao-fg-0 shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
                    : "text-ao-fg-3 hover:text-ao-fg-1 hover:bg-[rgba(255,255,255,0.05)] active:bg-[rgba(255,255,255,0.08)]"
                }`}
              >
                <Icon name="code" size={11} /> Write
              </button>
              <button
                type="button"
                onClick={() => setView("preview")}
                className={`inline-flex items-center gap-[5px] px-[10px] py-[4px] rounded-[5px] font-mono text-[11.5px] transition-[background,color,box-shadow] duration-[100ms] ${
                  view === "preview"
                    ? "bg-ao-bg-2 text-ao-fg-0 shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
                    : "text-ao-fg-3 hover:text-ao-fg-1 hover:bg-[rgba(255,255,255,0.05)] active:bg-[rgba(255,255,255,0.08)]"
                }`}
              >
                <Icon name="eye" size={11} /> Preview
              </button>
            </div>

            {/* Divider */}
            <div className="w-px h-[16px] shrink-0 bg-[var(--ao-line-0)] mx-[2px]" />

            {/* Format buttons */}
            <div className="flex items-center gap-[1px]">
              {([
                { icon: <Icon name="heading" size={13} />, label: "Heading", action: () => setV((p) => ({ ...p, body: p.body + "\n## " })) },
                { icon: <Icon name="bold" size={13} />,    label: "Bold",    action: () => setV((p) => ({ ...p, body: p.body + "****" })) },
                { icon: <Icon name="italic" size={13} />,  label: "Italic",  action: () => setV((p) => ({ ...p, body: p.body + "**" })) },
                { icon: <Icon name="link" size={13} />,    label: "Link",    action: () => setV((p) => ({ ...p, body: p.body + "[](url)" })) },
                { icon: <Icon name="code" size={13} />,    label: "Code",    action: () => setV((p) => ({ ...p, body: p.body + "``" })) },
              ] as { icon: React.ReactNode; label: string; action: () => void }[]).map(({ icon, label, action }) => (
                <button
                  key={label}
                  type="button"
                  aria-label={label}
                  title={label}
                  onClick={action}
                  className="w-[30px] h-[28px] inline-flex items-center justify-center rounded-[5px] text-ao-fg-3 border border-transparent transition-[background,color,border-color] duration-[80ms] hover:text-ao-fg-0 hover:bg-[rgba(255,255,255,0.07)] hover:border-[var(--ao-line-0)] active:bg-[rgba(255,255,255,0.12)] active:text-ao-fg-0"
                >
                  {icon}
                </button>
              ))}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* History toggle */}
            <button
              type="button"
              onClick={() => setHistoryOpen((o) => !o)}
              aria-expanded={historyOpen}
              aria-label="Toggle prompt version history"
              className={`inline-flex items-center gap-[5px] px-[10px] py-[4px] rounded-[5px] font-mono text-[11.5px] border transition-[background,color,border-color,box-shadow] duration-[100ms] ${
                historyOpen
                  ? "bg-[var(--ao-accent-soft)] border-[var(--ao-accent-line)] text-[var(--ao-accent)] shadow-[0_0_0_2px_var(--ao-accent-softer)]"
                  : "border-[var(--ao-line-0)] text-ao-fg-3 hover:text-ao-fg-1 hover:bg-[rgba(255,255,255,0.05)] hover:border-[var(--ao-line-1)] active:bg-[rgba(255,255,255,0.08)]"
              }`}
            >
              History
            </button>
          </div>

          {historyOpen && (
            <div className="border-b border-[var(--ao-line)] bg-[var(--ao-bg-2)]">
              <BodyHistoryPanel
                agentId={agentId}
                onRestore={(restored) => {
                  setV((prev) => ({ ...prev, body: restored }));
                  setHistoryOpen(false);
                }}
              />
            </div>
          )}

          {view === "write" ? (
            <div className="ao-editor" style={{ height: promptH }}>
              <div className="ao-gutter">
                {promptLines.map((_, i) => <div key={i}>{i + 1}</div>)}
              </div>
              <div style={{ position: "relative" }}>
                <pre
                  ref={preRef}
                  aria-hidden
                  dangerouslySetInnerHTML={{ __html: v.body ? highlightMd(v.body, "var(--ao-accent)") : "\n" }}
                  style={{ ...AO_LAYER, color: "var(--ao-fg-0)", zIndex: 0, pointerEvents: "none" }}
                />
                <textarea
                  ref={taRef}
                  value={v.body}
                  onChange={(e) => setV((p) => ({ ...p, body: e.target.value }))}
                  spellCheck={false}
                  style={{
                    ...AO_LAYER,
                    zIndex: 1,
                    color: "transparent",
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    WebkitTextFillColor: "transparent" as any,
                    caretColor: "var(--ao-fg-0)",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    resize: "none",
                    overflow: "hidden",
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="ao-preview">
              <MarkdownPreview md={v.body} />
            </div>
          )}
        </div>
      </div>

      {/* Error display */}
      {(errors.length > 0 || serverError) && (
        <div className="bg-[var(--ao-bad-soft)] border border-[var(--ao-bad)] rounded-[var(--ao-radius-md)] px-[14px] py-[10px] text-[var(--ao-bad)] text-[13px] mb-[14px]">
          {serverError ?? errors.join(" · ")}
        </div>
      )}

      {/* Buffer so the sticky save bar below never grazes the last line of
          the prompt editor when the user has scrolled to the bottom. */}
      <div aria-hidden className="h-[24px] shrink-0" />

      {/* Save bar */}
      <div className="sticky bottom-0 flex items-center gap-3 px-6 py-[14px] bg-[var(--ao-bg-1)] border-t border-ao-line-1 mt-4 -mx-6 -mb-6 shrink-0">
        {dirty ? (
          <div className="inline-flex items-center gap-2 font-mono text-[12px] text-[var(--ao-warn)]">
            <span className="w-[6px] h-[6px] rounded-full bg-[var(--ao-warn)] shadow-[0_0_8px_var(--ao-warn)] animate-[ao-pulse_1.6s_infinite]" />
            Unsaved changes
          </div>
        ) : (
          <span className="text-ao-fg-3 font-mono text-[11.5px]">No changes</span>
        )}
        <div className="ml-auto flex gap-2">
          <button type="button" className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium bg-[rgba(217,83,79,0.12)] border border-[rgba(217,83,79,0.35)] text-ao-bad hover:bg-[rgba(217,83,79,0.2)] disabled:opacity-50" onClick={onDelete} disabled={deleting}>
            <Icon name="trash" size={12} /> Delete
          </button>
          <button type="button" className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium bg-ao-bg-3 border border-ao-line-1 text-ao-fg-0 hover:bg-ao-bg-4 hover:border-ao-line-2 disabled:opacity-50" onClick={handleDiscard} disabled={!dirty}>
            <Icon name="refresh" size={12} /> Revert
          </button>
          <button type="button" className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium bg-ao-accent border border-transparent text-white hover:bg-[color-mix(in_oklab,var(--ao-accent)_90%,white)] disabled:opacity-50" onClick={handleSave} disabled={saving || !dirty}>
            <Icon name="check" size={13} /> Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

