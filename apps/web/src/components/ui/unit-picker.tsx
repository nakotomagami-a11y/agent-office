"use client";

import { AgentAvatar } from "./agent-avatar";
import {
  UNIT_FACTIONS,
  UNIT_KINDS,
  FACTION_LABELS,
  UNIT_DEFS,
  parseUnit,
  formatUnit,
  type UnitSelection,
} from "./unit-sprite-registry";

export type UnitPickerProps = {
  /** Current value in `"faction/kind"` format, or empty string for auto. */
  value: string;
  onChange: (value: string) => void;
  /** Name used to compute the auto-selection preview. */
  agentName?: string;
};

const FACTION_COLORS: Record<string, string> = {
  blue:   "#4a8fff",
  red:    "#e8553a",
  purple: "#9c70d4",
  yellow: "#d4a832",
  black:  "#888",
};

export function UnitPicker({ value, onChange, agentName: _agentName }: UnitPickerProps) {
  const current = parseUnit(value);

  const toggle = (sel: UnitSelection) => {
    const next = formatUnit(sel);
    onChange(current && formatUnit(current) === next ? "" : next);
  };

  return (
    <div className="flex flex-col gap-[10px]">
      {/* Grid table */}
      <div className="rounded-[10px] border border-[var(--ao-line-1)] overflow-hidden">

        {/* Header row — kind labels */}
        <div className="flex items-center bg-[rgba(0,0,0,0.2)] border-b border-[var(--ao-line-1)] px-[10px] py-[9px]">
          <div className="w-[80px] shrink-0" />
          <div className="flex-1 flex items-center">
            {UNIT_KINDS.map((kind) => (
              <div
                key={kind}
                className="flex-1 basis-0 text-[10px] font-[var(--ao-font-mono)] uppercase text-[var(--ao-fg-3)] text-center tracking-[0.07em] font-semibold"
              >
                {UNIT_DEFS[kind].label}
              </div>
            ))}
          </div>
        </div>

        {/* Faction rows */}
        <div className="flex flex-col divide-y divide-[var(--ao-line-0)]">
          {UNIT_FACTIONS.map((faction) => (
            <div
              key={faction}
              className="flex items-center px-[10px] py-[8px]"
            >
              {/* Faction label */}
              <div className="w-[80px] shrink-0 flex items-center gap-[7px] pr-[6px]">
                <span
                  className="w-[8px] h-[8px] rounded-full shrink-0 ring-1 ring-black/20"
                  style={{ background: FACTION_COLORS[faction] ?? "#888" }}
                />
                <span className="text-[11px] font-[var(--ao-font-mono)] text-[var(--ao-fg-2)] capitalize">
                  {FACTION_LABELS[faction]}
                </span>
              </div>

              {/* Unit buttons */}
              <div className="flex-1 flex items-center">
                {UNIT_KINDS.map((kind) => {
                  const sel: UnitSelection = { faction, kind };
                  const isActive = !!(current && current.faction === faction && current.kind === kind);
                  return (
                    <button
                      key={`${faction}/${kind}`}
                      type="button"
                      title={`${FACTION_LABELS[faction]} ${UNIT_DEFS[kind].label}`}
                      onClick={() => toggle(sel)}
                      className={[
                        "flex-1 basis-0 flex items-center justify-center p-[4px] rounded-[6px] mx-[2px] my-[2px] transition-[background,box-shadow] duration-100",
                        isActive
                          ? "bg-[var(--ao-accent-soft)] [box-shadow:inset_0_0_0_2px_var(--ao-accent)]"
                          : "hover:bg-[var(--ao-bg-3)]",
                      ].join(" ")}
                    >
                      <AgentAvatar unit={sel} size={44} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selected state footer */}
      <div className="flex items-center gap-[8px] px-[2px] min-h-[22px]">
        {current ? (
          <>
            <span
              className="w-[6px] h-[6px] rounded-full shrink-0"
              style={{ background: FACTION_COLORS[current.faction] ?? "#888" }}
            />
            <AgentAvatar unit={current} size={24} />
            <span className="text-[12px] font-[var(--ao-font-mono)] text-[var(--ao-fg-1)]">
              {FACTION_LABELS[current.faction]} {UNIT_DEFS[current.kind].label}
            </span>
            <span className="text-[var(--ao-fg-3)] mx-[1px]">·</span>
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-[11.5px] font-[var(--ao-font-mono)] text-[var(--ao-fg-3)] hover:text-[var(--ao-accent)] transition-colors duration-100 cursor-pointer bg-transparent border-none p-0"
            >
              reset to auto
            </button>
          </>
        ) : (
          <span className="text-[12px] font-[var(--ao-font-mono)] text-[var(--ao-fg-3)] italic">
            auto — derived from agent name
          </span>
        )}
      </div>
    </div>
  );
}
