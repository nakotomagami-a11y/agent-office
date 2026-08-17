"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { WeaponIcon } from "@/components/ui/weapon-icon";
import { ACCENT_BTN } from "@/lib/button-styles";
import {
  skillIconKey,
  skillIconConfig,
  useSetSkillIcon,
  type SkillIconMap,
} from "../hooks/use-skills";
import type { RegistrySkill } from "@agent-office/domain/types";
import { WeaponIconModal } from "./weapon-icon-modal";
import { SURFACE_CARD, SURFACE_CARD_HOVER, SURFACE_WELL } from "./surface";
import { skillOrigin } from "../registry/filter-registry";
import { skillWeight } from "../registry/skill-weight";

interface SkillCardProps {
  skill: RegistrySkill;
  icons: SkillIconMap | undefined;
  busy: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onEdit: () => void;
}

/**
 * Compact armory tile. The weapon icon is the identity; the whole card lifts on
 * hover and reveals the Edit affordance so the grid stays quiet at rest but
 * dense and scannable across 200+ skills.
 */
export function SkillCard({ skill, icons, busy, onInstall, onUninstall, onEdit }: SkillCardProps) {
  const [editingIcon, setEditingIcon] = useState(false);
  const setIconMut = useSetSkillIcon();
  const key = skillIconKey(skill);
  const config = skillIconConfig(icons, key);
  const [owner, repo] = skill.source.split("/");
  const origin = skillOrigin(skill);
  const isLocal = origin === "local";
  const weight = skillWeight(skill);

  return (
    <div
      className={`group relative flex flex-col gap-3 h-full p-4 rounded-[var(--r-lg)] ${SURFACE_CARD} ${SURFACE_CARD_HOVER}
                 transition-[transform,border-color,box-shadow] duration-150 hover:-translate-y-0.5`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setEditingIcon(true)}
          title="Change icon"
          aria-label={`Change icon for ${skill.name}`}
          className={`shrink-0 flex items-center justify-center w-[60px] h-[60px] rounded-[var(--r-md)] ${SURFACE_WELL}
                     transition-colors hover:border-ao-accent-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc`}
        >
          <WeaponIcon config={config} size={46} particles="themed" />
        </button>
        <div className="min-w-0 flex-1 pt-0.5">
          {/* Line 1 — name (truncates) with a fixed right-edge status dot */}
          <div className="flex items-center gap-2">
            <span className="flex-1 min-w-0 font-semibold text-[14px] leading-tight truncate" title={skill.name}>
              {skill.name}
            </span>
            {skill.installed ? (
              <span
                title="Installed"
                className="shrink-0 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.06em] text-ao-ok"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-ao-ok" /> installed
              </span>
            ) : null}
          </div>
          {/* Line 2 — one metadata row: origin · source, weight pinned right */}
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-mono min-w-0">
            {isLocal ? (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-acc-faint border border-ao-accent-line px-1.5 py-px text-[9px] uppercase tracking-[0.06em] text-acc">
                <Icon name="pen" size={9} /> Mine
              </span>
            ) : (
              <Icon name="branch" size={11} className="shrink-0 text-txt-4" />
            )}
            <span className="truncate text-txt-3 min-w-0">
              {isLocal ? (
                "local copy"
              ) : (
                <>
                  {owner}
                  <span className="text-txt-4">/{repo}</span>
                </>
              )}
            </span>
            {weight ? (
              <span
                title={weight.title}
                aria-label={weight.title}
                className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-full border border-line bg-bg-2 px-1.5 py-0.5 text-[10px]"
              >
                <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${weight.dotClass}`} />
                <span className={weight.textClass}>{weight.label}</span>
                <span className="text-txt-4">tok</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <p className="text-[12px] leading-[1.5] text-txt-2 line-clamp-2 min-h-[36px]">
        {skill.description || "No description provided for this skill."}
      </p>

      {skill.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {skill.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full bg-bg-2 border border-line px-2 py-0.5 text-[10.5px] font-mono text-txt-3"
            >
              {tag}
            </span>
          ))}
          {skill.tags.length > 4 ? (
            <span className="inline-flex items-center px-1.5 py-0.5 text-[10.5px] font-mono text-txt-4">
              +{skill.tags.length - 4}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onEdit}
          title={isLocal ? "Edit this skill" : "Fork to an editable local copy"}
          aria-label={isLocal ? `Edit ${skill.name}` : `Fork ${skill.name} to a local copy`}
          className="inline-flex items-center gap-1.5 h-[30px] px-2.5 rounded-[8px] text-[12px] text-txt-2 bg-transparent border border-line
                     opacity-0 -translate-x-1 transition-all duration-150
                     group-hover:opacity-100 group-hover:translate-x-0
                     hover:bg-bg-2 hover:text-txt focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc"
        >
          <Icon name={isLocal ? "edit" : "branch"} size={12} /> {isLocal ? "Edit" : "Fork"}
        </button>

        <div className="ml-auto">
          {skill.installed ? (
            <button
              type="button"
              onClick={onUninstall}
              disabled={busy}
              className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-[8px] text-[12px] text-txt-2 bg-bg-1 border border-line-2 shadow-1
                         hover:text-[var(--error)] hover:border-[color-mix(in_srgb,var(--error)_40%,transparent)]
                         disabled:opacity-50 disabled:cursor-not-allowed
                         focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc"
            >
              <Icon name="trash" size={12} /> Remove
            </button>
          ) : (
            <button
              type="button"
              onClick={onInstall}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 h-[30px] px-3.5 rounded-[8px] text-[12px] font-medium ${ACCENT_BTN}`}
            >
              <Icon name="download" size={12} /> Install
            </button>
          )}
        </div>
      </div>

      <WeaponIconModal
        open={editingIcon}
        name={skill.name}
        current={config}
        onSave={(cfg) => setIconMut.mutate({ key, config: cfg })}
        onClose={() => setEditingIcon(false)}
      />
    </div>
  );
}
