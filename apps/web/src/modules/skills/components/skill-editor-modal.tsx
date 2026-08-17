"use client";

import { useEffect, useState } from "react";
import type { IconClassSelector, IconConfig } from "@agent-office/pixel-icons";
import { createRandomSeed } from "@agent-office/pixel-icons";
import { ModalShell } from "@/components/ui/modal-shell";
import { TextInput } from "@/components/ui/text-input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { WeaponIcon } from "@/components/ui/weapon-icon";
import type { RegistrySkill } from "@agent-office/domain/types";
import { skillOrigin } from "../registry/filter-registry";
import { useCreateSkill, useSetSkillIcon, skillIconKey } from "../hooks/use-skills";

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
 * Authoring surface for a skill. Forge a new local skill, edit a local one, or
 * fork a read-only GitHub skill into an editable local copy. Fields map onto
 * the on-disk SKILL.md frontmatter.
 */
export function SkillEditorModal({ open, mode, skill, onClose }: SkillEditorModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState(STARTER_BODY);
  const [icon, setIcon] = useState<IconConfig>({ seed: createRandomSeed(), iconClass: "any" });

  const createMut = useCreateSkill();
  const setIconMut = useSetSkillIcon();

  useEffect(() => {
    if (!open) return;
    createMut.reset();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, skill]);

  const isEdit = mode === "edit";
  const isFork = isEdit && !!skill && skillOrigin(skill) === "github";

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && body.trim().length > 0 && !createMut.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      const parsedTags = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await createMut.mutateAsync({
        name: trimmedName,
        description: description.trim(),
        tags: parsedTags,
        body,
        overwrite: isEdit,
      });
      // Persist the chosen weapon icon against the now-local skill.
      setIconMut.mutate({ key: skillIconKey({ source: "local", name: res.skill.name }), config: icon });
      onClose();
    } catch {
      // createMut.error drives the inline message below; keep the modal open.
    }
  };

  const errorMessage = createMut.isError
    ? (createMut.error as Error & { status?: number })?.message === "skill_exists"
      ? `A skill named "${trimmedName}" already exists. Pick another name.`
      : "Couldn't save the skill. Check the name and try again."
    : null;

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
          {errorMessage ? (
            <span className="mr-auto flex items-center gap-1.5 text-[11.5px] font-medium text-status-error">
              <Icon name="slash" size={12} /> {errorMessage}
            </span>
          ) : (
            <span className="mr-auto flex items-center gap-1.5 text-[11.5px] font-mono text-txt-4">
              <Icon name="folder" size={12} /> ~/.claude/agents/_skills/{trimmedName || "…"}/SKILL.md
            </span>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
            <Icon name={createMut.isPending ? "refresh" : submitIcon} size={13} />
            {createMut.isPending ? "Saving…" : submitLabel}
          </Button>
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
            <Button
              size="sm"
              onClick={() => setIcon((c) => ({ ...c, seed: createRandomSeed() }))}
            >
              <Icon name="refresh" size={12} /> Reroll
            </Button>
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
