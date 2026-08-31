"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { WeaponIcon } from "@/components/ui/weapon-icon";
import { cn } from "@/lib/cn";
import {
  skillIconKey,
  skillIconConfig,
  useSetSkillIcon,
  type SkillIconMap,
} from "../hooks/use-skills";
import type { RegistrySkill } from "@agent-office/domain/types";
import { WeaponIconModal } from "./weapon-icon-modal";
import { skillOrigin } from "../registry/filter-registry";
import { skillWeight } from "../registry/skill-weight";

interface SkillCardProps {
  skill: RegistrySkill;
  icons: SkillIconMap | undefined;
  busy: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onEdit: () => void;
  /** Duplicate this skill into a new `-fork` local copy. */
  onFork: () => void;
}

/**
 * Armory tile. The weapon icon is the identity; Fork/Edit and Install/Remove
 * sit in the footer, always visible (matches the V3 mockup — every card
 * shows its full action row at rest, not just on hover). GitHub-origin
 * skills only get Fork (editing one in place isn't a real capability — it
 * always forks); local skills get both.
 */
export function SkillCard({ skill, icons, busy, onInstall, onUninstall, onEdit, onFork }: SkillCardProps) {
  const [editingIcon, setEditingIcon] = useState(false);
  const setIconMut = useSetSkillIcon();
  const key = skillIconKey(skill);
  const config = skillIconConfig(icons, key);
  const [owner, repo] = skill.source.split("/");
  const origin = skillOrigin(skill);
  const isLocal = origin === "local";
  const weight = skillWeight(skill);

  return (
    <div className="h-full flex flex-col gap-[13px] p-[16px] rounded-[22px] surface-sheen shadow-[var(--lift)] transition-transform duration-[180ms] hover:-translate-y-[3px]">
      <div className="flex items-start gap-[13px]">
        <button
          type="button"
          onClick={() => setEditingIcon(true)}
          title="Change icon"
          aria-label={`Change icon for ${skill.name}`}
          className="relative shrink-0 w-[52px] h-[52px] rounded-[15px] bg-card-2 border border-edge shadow-[var(--inset-hi)] flex items-center justify-center overflow-hidden"
        >
          <WeaponIcon config={config} size={46} particles="themed" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-[8px]">
            <span className="flex-1 min-w-0 text-[14.5px] font-bold truncate">{skill.name}</span>
            {skill.installed ? (
              <span className="shrink-0 flex items-center gap-[5px] text-[9.5px] font-bold py-[2px] px-[7px] rounded-full bg-green-soft text-green whitespace-nowrap">
                INSTALLED
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-[7px] mt-[6px]">
            {isLocal ? (
              <span className="shrink-0 flex items-center gap-[4px] text-[9.5px] font-bold py-[2px] px-[7px] rounded-full bg-acc-soft text-acc whitespace-nowrap">
                MINE
              </span>
            ) : (
              <Icon name="branch" size={11} className="shrink-0 text-txt-4" />
            )}
            <span className="flex-1 min-w-0 font-mono text-[10.5px] text-txt-4 truncate">
              {isLocal ? "local copy" : (
                <>
                  {owner}
                  <span className="text-txt-4">/{repo}</span>
                </>
              )}
            </span>
            {weight ? (
              <span
                title={weight.title}
                className={cn(
                  "shrink-0 flex items-center gap-[4px] font-mono text-[10px] py-[2px] px-[7px] rounded-full bg-card-3 whitespace-nowrap",
                  weight.textClass,
                )}
              >
                {weight.label} tok
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <p className="text-[12.5px] leading-[1.6] text-txt-3 line-clamp-2 min-h-[40px]">
        {skill.description || "No description provided for this skill."}
      </p>

      {skill.tags.length > 0 ? (
        <div className="flex flex-wrap gap-[6px]">
          {skill.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="font-mono text-[10px] py-[3px] px-[8px] rounded-[8px] bg-card-2 border border-edge text-txt-4 whitespace-nowrap"
            >
              {tag}
            </span>
          ))}
          {skill.tags.length > 4 ? (
            <span className="flex items-center text-[10px] font-mono text-txt-4">+{skill.tags.length - 4}</span>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-[9px] mt-auto pt-[3px]">
        {isLocal ? (
          <button
            type="button"
            onClick={onEdit}
            title="Edit this skill"
            aria-label={`Edit ${skill.name}`}
            className="flex items-center gap-[6px] py-[8px] px-[13px] rounded-[11px] border border-edge text-txt-4 text-[12px] font-semibold whitespace-nowrap cursor-pointer transition-all duration-150 hover:text-txt hover:border-txt-4"
          >
            <Icon name="edit" size={13} /> Edit
          </button>
        ) : null}
        <button
          type="button"
          onClick={onFork}
          title={isLocal ? "Duplicate to a new local skill" : "Fork to an editable local copy"}
          aria-label={isLocal ? `Duplicate ${skill.name}` : `Fork ${skill.name} to a local copy`}
          className="flex items-center gap-[6px] py-[8px] px-[13px] rounded-[11px] border border-edge text-txt-4 text-[12px] font-semibold whitespace-nowrap cursor-pointer transition-all duration-150 hover:text-acc hover:border-acc-line"
        >
          <Icon name="branch" size={13} /> Fork
        </button>

        <span className="flex-1" />

        {skill.installed ? (
          <button
            type="button"
            onClick={onUninstall}
            disabled={busy}
            className="flex items-center gap-[7px] py-[9px] px-[16px] rounded-[12px] border border-edge-2 bg-card-2 text-txt-3 text-[12.5px] font-semibold whitespace-nowrap cursor-pointer transition-all duration-150 hover:text-red hover:border-red disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon name="trash" size={13} /> Remove
          </button>
        ) : (
          <button
            type="button"
            onClick={onInstall}
            disabled={busy}
            className="flex items-center gap-[7px] py-[9px] px-[16px] rounded-[12px] bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white text-[12.5px] font-bold whitespace-nowrap cursor-pointer shadow-[0_10px_22px_-12px_rgba(139,123,255,0.8)] transition-transform duration-150 hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon name="download" size={13} /> Install
          </button>
        )}
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
