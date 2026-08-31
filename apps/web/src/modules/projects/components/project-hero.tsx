"use client";

import { useState } from "react";
import type { Project } from "@agent-office/domain/types";
import type { OfficeAgent } from "@/modules/office/hooks/use-office-agents";
import { Icon } from "@/components/ui/icon";
import { PlanetCanvas } from "@/components/ui/planet-canvas";
import { UnitSprite } from "@/components/ui/unit-sprite";
import { planetTag } from "@/lib/planet-seed";
import { ProjectRuntimeBar, ProjectShortcutsBar } from "@/modules/office/components/office-toolbar";

export type ProjectHeroProps = {
  project: Project;
  rosterAgentIds: string[];
  workingCount: number;
  allAgents: OfficeAgent[];
  onOpenPlanetEditor: () => void;
  onAddAgent: () => void;
  onSaveDescription: (value: string) => unknown;
};

const AVATAR_STACK_CAP = 4;

/**
 * The cosmic hero card — this IS the page header in the V3 dashboard (there's
 * no separate "Project" title bar above it, confirmed against the raw
 * mockup). Planet art, editable name/description, roster status, and the
 * real project action toolbar all live here, split across two rows: build/
 * dev-server stay next to "Add agent"; folder/editor/clear-cache sit on the
 * roster row, to the left of the avatar stack, since they're reached far
 * less often.
 */
export function ProjectHero({
  project,
  rosterAgentIds,
  workingCount,
  allAgents,
  onOpenPlanetEditor,
  onAddAgent,
  onSaveDescription,
}: ProjectHeroProps) {
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState("");
  const tag = planetTag(project.meta.planet);

  const submitDesc = (value: string) => {
    setEditingDesc(false);
    if (value.trim() !== project.meta.description) void onSaveDescription(value.trim());
  };

  return (
    <div className="flex-[1.62] min-w-0 relative overflow-hidden rounded-[24px] surface-sheen shadow-[var(--lift)] px-[28px] py-[26px] flex items-center gap-[28px]">
      <div
        aria-hidden
        className="absolute left-[-40px] bottom-[-120px] w-[340px] h-[300px] pointer-events-none"
        style={{ background: "radial-gradient(circle at 50% 50%, rgba(139,123,255,.20), transparent 64%)" }}
      />
      <button
        type="button"
        onClick={onOpenPlanetEditor}
        title="Change planet"
        aria-label="Change planet"
        className="relative shrink-0 group cursor-pointer border-0 bg-transparent p-0"
      >
        <PlanetCanvas projectId={project.id} config={project.meta.planet} size={168} />
        <span className="absolute bottom-[4px] right-[4px] w-[30px] h-[30px] rounded-full flex items-center justify-center bg-card-3 border border-edge-2 text-txt-2 shadow-[var(--lift)] transition-colors duration-150 group-hover:text-acc">
          <Icon name="edit" size={14} />
        </span>
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[9px] flex-wrap">
          {workingCount > 0 && (
            <span className="flex items-center gap-[7px] px-[11px] py-[4px] rounded-full bg-green-soft text-green text-[11.5px] font-semibold whitespace-nowrap shrink-0">
              <span className="w-[6px] h-[6px] rounded-full bg-green animate-pulse" />
              {workingCount} of {rosterAgentIds.length} working
            </span>
          )}
          {tag && (
            <span className="text-[11.5px] font-semibold px-[10px] py-[4px] rounded-full bg-card-3 text-txt-3 whitespace-nowrap shrink-0">
              {tag}
            </span>
          )}
        </div>

        <h1 className="m-0 mt-[13px] text-[42px] leading-[1.02] tracking-[-0.035em] font-extrabold">{project.meta.name}</h1>

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

        <div className="flex flex-col gap-[11px] mt-[20px]">
          <div className="flex items-center gap-[10px] flex-wrap">
            <button
              type="button"
              onClick={onAddAgent}
              className="flex items-center gap-[8px] px-[18px] py-[11px] rounded-[13px] border-none bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white text-[13.5px] font-bold cursor-pointer whitespace-nowrap shadow-[0_14px_30px_-14px_rgba(139,123,255,0.9)] transition-transform duration-150 hover:-translate-y-[2px]"
            >
              <Icon name="plus" size={15} /> Add agent
            </button>
            <ProjectRuntimeBar projectId={project.id} />
          </div>

          {/* Unconditional (not gated on roster size) — ProjectShortcutsBar must
              keep showing on an empty-roster project, matching its old row-1
              behavior. Only the avatar stack itself needs agents to render. */}
          <div className="flex items-center gap-[14px]">
            <ProjectShortcutsBar projectId={project.id} />
            {rosterAgentIds.length > 0 && (
              <RosterAvatarStack rosterAgentIds={rosterAgentIds} allAgents={allAgents} />
            )}
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
  if (editing) {
    return (
      <textarea
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
        rows={3}
        className="w-full mt-[11px] max-w-[430px] p-[10px] rounded-[10px] bg-card-2 border border-edge text-[13px] text-txt leading-[1.55] outline-none resize-none placeholder:text-txt-4 focus:border-acc-line"
      />
    );
  }
  if (value) {
    return (
      <p
        onClick={onEdit}
        title="Click to edit description"
        className="m-0 mt-[11px] max-w-[430px] text-[13.5px] text-txt-2 leading-[1.62] cursor-text transition-colors duration-150 hover:text-txt"
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

function RosterAvatarStack({ rosterAgentIds, allAgents }: { rosterAgentIds: string[]; allAgents: OfficeAgent[] }) {
  const shown = rosterAgentIds.slice(0, AVATAR_STACK_CAP);
  const overflow = rosterAgentIds.length - shown.length;

  return (
    <div className="flex items-center">
      {shown.map((agentId, i) => {
        const agent = allAgents.find((a) => a.id === agentId);
        const online = agent?.status === "working" || agent?.status === "thinking";
        return (
          <span
            key={agentId}
            className={`flex items-center justify-center w-[30px] h-[30px] rounded-full overflow-hidden bg-card-3 border-2 ${online ? "border-green" : "border-card"}`}
            style={i > 0 ? { marginLeft: -9 } : undefined}
          >
            {/* Roster can reference an agent whose definition was since removed from
                ~/.claude/agents/ — fall back to a generic glyph instead of a blank hole. */}
            {agent ? <UnitSprite unit={agent.unitChoice} size={30} animate={false} /> : <Icon name="cpu" size={13} className="text-txt-4" />}
          </span>
        );
      })}
      {overflow > 0 && (
        <span
          className="flex items-center justify-center w-[30px] h-[30px] rounded-full bg-card-3 border-2 border-card text-[10.5px] font-bold text-txt-3"
          style={{ marginLeft: -9 }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
