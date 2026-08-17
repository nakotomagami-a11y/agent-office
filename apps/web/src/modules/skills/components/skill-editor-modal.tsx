"use client";

import { useEffect, useState } from "react";
import type { IconClassSelector, IconConfig } from "@agent-office/pixel-icons";
import { createRandomSeed } from "@agent-office/pixel-icons";
import { ModalShell } from "@/components/ui/modal-shell";
import { TextInput } from "@/components/ui/text-input";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/ui/icon";
import { WeaponIcon } from "@/components/ui/weapon-icon";
import { ACCENT_BTN } from "@/lib/button-styles";
import type { RegistrySkill } from "@agent-office/domain/types";
import { skillOrigin } from "../registry/filter-registry";

const WEAPON_TYPES: { value: IconClassSelector; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "blades", label: "Blade" },
  { value: "spears", label: "Spear" },
  { value: "axes", label: "Axe" },
  { value: "staffs", label: "Staff" },
  { value: "tridents", label: "Trident" },
];

const STARTER_BODY = `---
name: my-skill
description: One sentence on what this skill does and when to use it.
---

# My Skill

Describe the capability here. Claude reads this file when the task calls for it.

## When to use
- …

## Steps
1. …
`;

type Mode = "create" | "edit";

interface SkillEditorModalProps {
  open: boolean;
  mode: Mode;
  /** Prefill source for edit mode. */
  skill?: RegistrySkill | null;
  onClose: () => void;
}

/**
 * Authoring surface for a skill. Visual shell — persistence is wired by the
 * functional pass; submit currently closes. Fields mirror the on-disk
 * SKILL.md frontmatter so wiring is a straight map.
 */
export function SkillEditorModal({ open, mode, skill, onClose }: SkillEditorModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState(STARTER_BODY);
  const [icon, setIcon] = useState<IconConfig>({ seed: createRandomSeed(), iconClass: "any" });

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && skill) {
      setName(skill.name);
      setDescription(skill.description);
      setTags(skill.tags.join(", "));
      setBody(STARTER_BODY.replace("my-skill", skill.name));
      setIcon({ seed: `${skill.source}/${skill.name}`, iconClass: "any" });
    } else {
      setName("");
      setDescription("");
      setTags("");
      setBody(STARTER_BODY);
      setIcon({ seed: createRandomSeed(), iconClass: "any" });
    }
  }, [open, mode, skill]);

  const isEdit = mode === "edit";
  const isFork = isEdit && !!skill && skillOrigin(skill) === "github";

  const title = !isEdit
    ? "Forge a new skill"
    : isFork
      ? `Fork to local — ${skill?.name ?? ""}`
      : `Edit skill — ${skill?.name ?? ""}`;
  const submitLabel = !isEdit ? "Forge skill" : isFork ? "Fork to local" : "Save changes";
  const submitIcon = !isEdit ? "hammer" : isFork ? "branch" : "check";

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      maxWidth={880}
      footer={
        <>
          <span className="mr-auto flex items-center gap-1.5 text-[11.5px] font-mono text-txt-4">
            <Icon name="folder" size={12} /> ~/.claude/agents/_skills/{name || "…"}/SKILL.md
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center h-8 px-4 rounded-[8px] text-[13px] font-medium text-txt-2 bg-transparent border border-line hover:bg-bg-3 hover:text-txt transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={!name.trim()}
            className={`inline-flex items-center gap-1.5 h-8 px-4 rounded-[8px] text-[13px] font-medium ${ACCENT_BTN}`}
          >
            <Icon name={submitIcon} size={13} />
            {submitLabel}
          </button>
        </>
      }
    >
      {isFork ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r-md)] border border-ao-accent-line bg-ao-accent-soft px-3.5 py-2.5">
          <Icon name="branch" size={15} className="text-acc mt-0.5 shrink-0" />
          <p className="text-[12px] leading-[1.5] text-txt-2">
            <span className="font-semibold text-txt">This is a read-only GitHub skill.</span> Saving
            creates an editable <span className="text-acc font-medium">local copy you own</span> — the
            original from{" "}
            <span className="font-mono text-txt-3">{skill?.source}</span> stays untouched and can still
            receive updates.
          </p>
        </div>
      ) : null}
      <div className="flex flex-col md:flex-row gap-5">
        {/* Left rail — identity */}
        <div className="flex md:flex-col md:w-[190px] shrink-0 gap-4 md:gap-3 items-center md:items-stretch">
          <div className="flex flex-col items-center gap-3 p-4 rounded-[var(--r-lg)] border border-line bg-bg-2">
            <WeaponIcon config={icon} size={84} particles="themed" />
            <button
              type="button"
              onClick={() => setIcon((c) => ({ ...c, seed: createRandomSeed() }))}
              className="inline-flex items-center gap-1.5 h-[28px] px-2.5 rounded-[8px] text-[12px] text-txt-2 bg-bg-1 border border-line-2 shadow-1 hover:bg-bg-3 hover:text-txt transition-colors"
            >
              <Icon name="refresh" size={12} /> Reroll
            </button>
          </div>
          <div className="flex flex-wrap gap-1 md:justify-center">
            {WEAPON_TYPES.map((w) => (
              <button
                key={w.value}
                type="button"
                onClick={() => setIcon((c) => ({ ...c, iconClass: w.value }))}
                className={`px-2 py-1 rounded-[7px] text-[11px] font-mono border transition-colors ${
                  icon.iconClass === w.value
                    ? "bg-ao-accent-soft border-ao-accent-line text-acc"
                    : "bg-bg-1 border-line text-txt-3 hover:text-txt hover:border-line-2"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <div className="hidden md:flex flex-col gap-1.5 rounded-[var(--r-md)] border border-line bg-bg-1 p-3">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-txt-2">
              <Icon name="sparkle" size={12} className="text-acc" /> How skills load
            </span>
            <span className="text-[11px] leading-[1.5] text-txt-4">
              Small skills are inlined into the agent prompt; larger ones are read on demand. Keep the
              description sharp — it{"’"}s what the agent matches against.
            </span>
          </div>
        </div>

        {/* Right — fields */}
        <div className="flex-1 min-w-0 flex flex-col gap-3.5">
          <Field label="Name" hint="lowercase, hyphenated — becomes the folder name">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. pdf-form-filler"
            />
          </Field>
          <Field label="Description" hint="one sentence — what it does and when to use it">
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Fills interactive PDF forms from a JSON payload…"
            />
          </Field>
          <Field label="Tags" hint="comma separated — used for search and category chips">
            <TextInput
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="documents, automation, pdf"
            />
          </Field>
          <Field label="SKILL.md" hint="the full instruction the agent reads on demand">
            <Textarea
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="font-mono text-[12px] leading-[1.55]"
            />
          </Field>
        </div>
      </div>
    </ModalShell>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2">
        <span className="text-[12px] font-semibold text-txt">{label}</span>
        {hint ? <span className="text-[11px] text-txt-4">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
