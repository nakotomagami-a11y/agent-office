"use client";

import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card-header";
import { TextInput } from "@/components/ui/text-input";
import { CodeEditor } from "@/components/ui/code-editor";
import { Select } from "@/components/ui/select";
import { Icon } from "@/components/ui/icon";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import { EMPTY_FORM, type AgentFormValues, type FormError, slugifyId, toBody, validateForm } from "../form/agent-form";
import { useCreateAgent, useDeleteAgent, useWriteAgent } from "../hooks/use-agents";
import { UnitPicker } from "@/components/ui/unit-picker";
import { Button } from "@/components/ui/button";
import { MODEL_OPTS, EFFORT_OPTS } from "@agent-office/domain/config/agent-opts";
import { SkillAutocompleteInput } from "@/modules/office/components/agent-details/tabs/settings-tab/skill-autocomplete-input";
import { iconForTool } from "@/modules/office/components/agent-details/tabs/settings-tab/tool-icon";
import { useSkillManifest } from "@/modules/skills/hooks/use-skills";

export type AgentFormProps = {
  initial?: AgentFormValues;
  /** Locks the id input (edit mode). */
  mode: "new" | "edit";
  /** When provided, fires after a successful save instead of navigating. */
  onSaved?: (id: string) => void;
  /** When provided, fires on Cancel instead of `router.back()`. */
  onCancel?: () => void;
  /** When provided, fires after a successful delete instead of navigating. */
  onDeleted?: () => void;
  /** Hide the Cancel button (useful inside modals with their own close UI). */
  hideCancel?: boolean;
};

const PERMS = ["ask", "plan", "auto"] as const;

export function AgentForm({ initial, mode, onSaved, onCancel, onDeleted, hideCancel = false }: AgentFormProps) {
  const t = useTranslations();
  const router = useRouter();
  const [values, setValues] = useState<AgentFormValues>(initial ?? EMPTY_FORM);
  const [errors, setErrors] = useState<FormError[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  const createMut = useCreateAgent();
  const writeMut = useWriteAgent();
  const deleteMut = useDeleteAgent();

  const update = <K extends keyof AgentFormValues>(key: K) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const errs = validateForm(values);
    setErrors(errs);
    if (errs.length > 0) return;

    const body = toBody(values);
    const onSuccess = ({ id }: { id: string }) => {
      if (onSaved) onSaved(id);
      else router.push(PAGE_ROUTES.agent(id));
    };
    const onError = (err: unknown) => setServerError(err instanceof Error ? err.message : String(err));

    if (mode === "new") createMut.mutate(body, { onSuccess, onError });
    else writeMut.mutate(body, { onSuccess, onError });
  };

  const onDelete = () => {
    if (mode !== "edit") return;
    if (!window.confirm(t("agent_form.delete_confirm", { id: values.id }))) return;
    deleteMut.mutate(values.id, {
      onSuccess: () => {
        if (onDeleted) onDeleted();
        else router.push(PAGE_ROUTES.agents);
      },
      onError: (err) => setServerError(err instanceof Error ? err.message : String(err)),
    });
  };

  const errorFor = (field: keyof AgentFormValues) => errors.find((e) => e.field === field)?.message;
  const isPending = createMut.isPending || writeMut.isPending;

  return (
    <form onSubmit={onSubmit} className="overflow-auto py-[18px] px-6 flex flex-col gap-[14px]">
      <Card>
        <CardHeader title={mode === "new" ? t("agent_form.title_new") : t("agent_form.title_edit", { id: values.id })} />
        <div className="p-4 flex flex-wrap items-start gap-3">
          <Field label={t("agent_form.label_name")} error={errorFor("name")}>
            <TextInput
              value={values.name}
              onChange={(e) => {
                const name = e.target.value;
                setValues((v) => ({ ...v, name, id: mode === "new" ? slugifyId(name) : v.id }));
              }}
              placeholder={t("agent_form.placeholder_name")}
              autoFocus={mode === "new"}
            />
          </Field>
          <Field label={t("agent_form.label_id")} error={errorFor("id")}>
            <TextInput
              value={values.id}
              onChange={update("id")}
              placeholder={t("agent_form.placeholder_id")}
              disabled={mode === "edit"}
            />
          </Field>
          <Field label={t("agent_form.label_desc")} error={errorFor("desc")} span={2}>
            <TextInput
              value={values.desc}
              onChange={update("desc")}
              placeholder={t("agent_form.placeholder_desc")}
            />
          </Field>
          <SectionDivider label="Runtime" />
          <Field label={t("agent_form.label_model")}>
            <TextInput
              value={values.model}
              onChange={update("model")}
              list="model-suggestions"
              placeholder="sonnet"
            />
            <datalist id="model-suggestions">
              {MODEL_OPTS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <Field label={t("agent_form.label_effort")}>
            <Select value={values.effort} onChange={update("effort")}>
              {EFFORT_OPTS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("agent_form.label_pm")}>
            <Select value={values.pm} onChange={update("pm")}>
              {PERMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </Field>
          <SectionDivider label="Capabilities" />
          <SkillsField
            label={t("agent_form.label_skills")}
            value={values.skills}
            onChange={(csv) => setValues((v) => ({ ...v, skills: csv }))}
          />
          <ToolsField
            label={t("agent_form.label_tools")}
            value={values.tools}
            onChange={(csv) => setValues((v) => ({ ...v, tools: csv }))}
          />
          <SectionDivider label="Appearance" />
          <Field label="Avatar" span={2}>
            <UnitPicker
              value={values.unit}
              onChange={(v) => setValues((prev) => ({ ...prev, unit: v }))}
              agentName={values.name}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title={t("agent_form.card_prompt_title")} sub={t("agent_form.card_prompt_sub")} />
        <div className="p-4">
          <CodeEditor
            value={values.body}
            onChange={(v) => setValues((prev) => ({ ...prev, body: v }))}
            minHeight={360}
            placeholder={t("agent_form.placeholder_body")}
            className={errorFor("body") ? "border-[var(--error)]" : undefined}
          />
          {errorFor("body") ? <FieldError message={errorFor("body")!} /> : null}
        </div>
      </Card>

      {serverError ? (
        <div className="px-[14px] py-3 rounded-[14px] bg-[var(--error)] border-0 text-white text-[14px] leading-[1.55] whitespace-pre-wrap max-w-full" role="alert">
          {serverError}
        </div>
      ) : null}

      <div className="flex gap-2 justify-between">
        {mode === "edit" ? (
          <Button variant="danger" onClick={onDelete} disabled={deleteMut.isPending}>
            <Icon name="x" /> {t("common.delete")}
          </Button>
        ) : <span />}
        <div className="flex gap-2">
          {hideCancel ? null : (
            <Button
              variant="ghost"
              onClick={() => (onCancel ? onCancel() : router.back())}
              disabled={isPending}
            >
              {t("agent_form.cancel")}
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </div>
    </form>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="basis-full w-full flex items-center gap-[10px] mt-[6px] -mb-1">
      <div className="flex-1 h-px bg-line" />
      <span className="text-[9.5px] font-mono uppercase tracking-[0.1em] text-txt-3 whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-line" />
    </div>
  );
}

function Field({ label, error, span = 1, children }: { label: string; error?: string; span?: 1 | 2; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${span === 2 ? "basis-full w-full" : "basis-[calc(50%-6px)]"}`}>
      <FieldLabel>{label}</FieldLabel>
      {children}
      {error ? <FieldError message={error} /> : null}
    </label>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] text-txt-3 font-mono uppercase tracking-[0.06em]">{children}</span>
  );
}

// ── Chip-based multi-value fields (skills, tools) ────────────────────────────
// The form stores skills/tools as comma-separated strings; these components
// bridge that to the app's chip UI (same look as the office settings panel).

const csvToArr = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const arrToCsv = (a: string[]) => a.join(", ");

const CHIP_WELL =
  "flex flex-wrap items-center gap-[6px] p-[6px] pl-[8px] bg-bg-1 border border-line-2 rounded-md min-h-[42px] " +
  "focus-within:border-acc focus-within:[box-shadow:0_0_0_3px_var(--acc-faint)] transition-[border-color,box-shadow] duration-[120ms]";

function ChipToken({ label, icon, onRemove }: { label: string; icon?: ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-[6px] h-[26px] pl-[9px] pr-[4px] bg-bg-3 border border-line rounded-[7px] font-mono text-[12px] text-txt">
      {icon ? <span className="flex text-txt-2 leading-none">{icon}</span> : null}
      <span className="leading-none">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="flex items-center justify-center w-[18px] h-[18px] rounded-[4px] text-txt-3 hover:text-[var(--error)] hover:bg-bg-1 transition-colors cursor-pointer"
      >
        <Icon name="x" size={10} />
      </button>
    </span>
  );
}

function SkillsField({ label, value, onChange }: { label: string; value: string; onChange: (csv: string) => void }) {
  const skills = csvToArr(value);
  const [input, setInput] = useState("");
  const manifestQ = useSkillManifest();
  const add = (slug: string) => { if (slug && !skills.includes(slug)) onChange(arrToCsv([...skills, slug])); };
  const remove = (slug: string) => onChange(arrToCsv(skills.filter((x) => x !== slug)));
  const commitFree = () => { const s = input.trim().replace(/,+$/, "").trim(); if (s) add(s); setInput(""); };
  return (
    <div className="flex flex-col gap-1 basis-full w-full">
      <FieldLabel>{label}</FieldLabel>
      <div className={CHIP_WELL}>
        {skills.map((s) => (
          <ChipToken key={s} label={s} onRemove={() => remove(s)} />
        ))}
        <SkillAutocompleteInput
          value={input}
          onChange={setInput}
          selected={skills}
          onAdd={add}
          onRemove={remove}
          onFreeTextCommit={commitFree}
          manifest={manifestQ.data?.skills ?? []}
          loading={manifestQ.isLoading}
          hasChips={skills.length > 0}
        />
      </div>
    </div>
  );
}

const AVAIL_TOOLS = ["Read", "Write", "Edit", "Bash", "WebFetch", "WebSearch", "Agent"];

function ToolsField({ label, value, onChange }: { label: string; value: string; onChange: (csv: string) => void }) {
  const tools = csvToArr(value);
  const [input, setInput] = useState("");
  const add = (tool: string) => { if (tool && !tools.includes(tool)) onChange(arrToCsv([...tools, tool])); };
  const remove = (tool: string) => onChange(arrToCsv(tools.filter((x) => x !== tool)));
  const commit = () => { const tool = input.trim().replace(/,+$/, "").trim(); if (tool) add(tool); setInput(""); };
  const suggestions = AVAIL_TOOLS.filter((tool) => !tools.includes(tool));
  return (
    <div className="flex flex-col gap-1 basis-full w-full">
      <FieldLabel>{label}</FieldLabel>
      <div className={CHIP_WELL}>
        {tools.map((tool) => (
          <ChipToken key={tool} label={tool} icon={iconForTool(tool)} onRemove={() => remove(tool)} />
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); } }}
          placeholder="+ add tool"
          aria-label="Add a tool"
          className="flex-1 min-w-[90px] bg-transparent border-0 outline-none text-txt font-mono text-[12.5px] placeholder:text-txt-3"
        />
      </div>
      {suggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-[6px] mt-[3px]">
          <span className="text-[10px] uppercase tracking-[0.06em] text-txt-4 font-mono mr-[2px]">suggested</span>
          {suggestions.map((tool) => (
            <button
              key={tool}
              type="button"
              onClick={() => add(tool)}
              className="inline-flex items-center gap-[6px] h-[24px] px-[9px] rounded-[7px] bg-transparent border border-dashed border-line-2 text-txt-2 text-[12px] font-mono cursor-pointer hover:bg-bg-2 hover:text-txt hover:border-line-strong transition-colors"
            >
              {iconForTool(tool)} {tool}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return <span className="text-[11.5px] text-[var(--error)]">{message}</span>;
}
