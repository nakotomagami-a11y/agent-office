// Form ↔ wire-format conversions for the agent editor. The form keeps lists
// as comma-separated strings for ergonomics; the wire shape (`AgentBody`) wants
// arrays. Pure helpers - no React imports - so they can be unit-tested.

import type { AgentBody, ApiAgent } from "@agent-office/domain/types";

export interface AgentFormValues {
  id: string;
  name: string;
  desc: string;
  skills: string;
  tools: string;
  pm: string;
  model: string;
  effort: string;
  room: string;
  /** Avatar override in `"<faction>/<kind>"` form, or empty for auto. */
  unit: string;
  body: string;
}

export const EMPTY_FORM: AgentFormValues = {
  id: "",
  name: "",
  desc: "",
  skills: "",
  tools: "Read, Write, Edit, Bash",
  pm: "ask",
  model: "sonnet",
  effort: "high",
  room: "",
  unit: "",
  body: "",
};

/** How many fields differ from the empty defaults — drives the "unsaved" badge. */
export function countDirty(values: AgentFormValues): number {
  return (Object.keys(EMPTY_FORM) as (keyof AgentFormValues)[]).filter(
    (k) => values[k] !== EMPTY_FORM[k],
  ).length;
}

export function toCsv(values: string[]): string {
  return values.join(", ");
}

export function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function fromApi(agent: ApiAgent, body: string): AgentFormValues {
  return {
    id: agent.name,
    name: agent.name,
    desc: agent.description,
    skills: toCsv(agent.skills),
    tools: toCsv(agent.tools),
    pm: agent.permissionMode ?? "ask",
    model: agent.defaultModel ?? "sonnet",
    effort: agent.defaultEffort ?? "high",
    room: agent.room ?? "",
    unit: agent.unit ?? "",
    body,
  };
}

export function toBody(values: AgentFormValues): AgentBody {
  return {
    id: slugifyId(values.id || values.name),
    name: values.name.trim(),
    desc: values.desc.trim(),
    skills: parseCsv(values.skills),
    tools: parseCsv(values.tools),
    pm: values.pm,
    model: values.model,
    effort: values.effort,
    body: values.body,
    room: values.room.trim() || undefined,
    unit: values.unit.trim() || undefined,
  };
}

export function slugifyId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

export interface FormError {
  field: keyof AgentFormValues | "_";
  message: string;
}

export function validateForm(values: AgentFormValues): FormError[] {
  const errors: FormError[] = [];
  const id = slugifyId(values.id || values.name);
  if (!values.name.trim()) errors.push({ field: "name", message: "name is required" });
  if (!id) errors.push({ field: "id", message: "id can't be empty after slugifying" });
  if (!values.desc.trim()) errors.push({ field: "desc", message: "give it a one-line description" });
  if (!values.body.trim()) errors.push({ field: "body", message: "system prompt body required" });
  return errors;
}
