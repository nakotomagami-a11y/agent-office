"use client";

import { useEffect, useState } from "react";
import type { IconConfig, IconClass, IconClassSelector, WeaponParts, PartOption } from "@agent-office/pixel-icons";
import {
  createRandomSeed,
  BLADE_PROFILE_OPTIONS, BLADE_GUARD_OPTIONS, BLADE_POMMEL_OPTIONS, BLADE_MODIFICATION_OPTIONS,
  AXE_HEAD_OPTIONS, AXE_BACK_OPTIONS, AXE_BUTT_OPTIONS, AXE_DECORATION_OPTIONS,
  SPEAR_HEAD_OPTIONS, SPEAR_COLLAR_OPTIONS, SPEAR_BUTT_OPTIONS, SPEAR_DECORATION_OPTIONS,
  STAFF_HEAD_OPTIONS, STAFF_SHAFT_OPTIONS, STAFF_BINDING_OPTIONS, STAFF_FOOT_OPTIONS,
  TRIDENT_TYPE_OPTIONS,
  SHIELD_SHAPE_OPTIONS, SHIELD_BLAZON_OPTIONS, SHIELD_EMBLEM_OPTIONS, SHIELD_RIM_OPTIONS,
} from "@agent-office/pixel-icons";
import { ModalShell } from "@/components/ui/modal-shell";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { Select } from "@/components/ui/select";
import { WeaponIcon } from "@/components/ui/weapon-icon";

const WEAPON_TYPES: { value: IconClassSelector; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "blades", label: "Blade" },
  { value: "spears", label: "Spear" },
  { value: "axes", label: "Axe" },
  { value: "staffs", label: "Staff" },
  { value: "tridents", label: "Trident" },
  { value: "shields", label: "Shield" },
];

/** One dropdown-able field within a weapon class's `parts` object. */
interface FieldDef {
  key: string;
  label: string;
  options: PartOption<string>[];
}

/**
 * Headline shape/hilt fields per weapon class — the "build it yourself"
 * dropdowns. Deliberately NOT every random roll (see WeaponParts docs) —
 * gems, wraps, weathering, colour stay seed-random.
 */
const PART_FIELDS: Partial<Record<IconClass, FieldDef[]>> = {
  blades: [
    { key: "profile", label: "Profile", options: BLADE_PROFILE_OPTIONS },
    { key: "guard", label: "Guard", options: BLADE_GUARD_OPTIONS },
    { key: "pommel", label: "Pommel", options: BLADE_POMMEL_OPTIONS },
    { key: "modification", label: "Decoration", options: BLADE_MODIFICATION_OPTIONS },
  ],
  axes: [
    { key: "head", label: "Head", options: AXE_HEAD_OPTIONS },
    { key: "back", label: "Back", options: AXE_BACK_OPTIONS },
    { key: "butt", label: "Butt", options: AXE_BUTT_OPTIONS },
    { key: "decoration", label: "Decoration", options: AXE_DECORATION_OPTIONS },
  ],
  spears: [
    { key: "head", label: "Head", options: SPEAR_HEAD_OPTIONS },
    { key: "collar", label: "Collar", options: SPEAR_COLLAR_OPTIONS },
    { key: "butt", label: "Butt", options: SPEAR_BUTT_OPTIONS },
    { key: "decoration", label: "Decoration", options: SPEAR_DECORATION_OPTIONS },
  ],
  staffs: [
    { key: "head", label: "Head", options: STAFF_HEAD_OPTIONS },
    { key: "shaft", label: "Shaft", options: STAFF_SHAFT_OPTIONS },
    { key: "binding", label: "Binding", options: STAFF_BINDING_OPTIONS },
    { key: "foot", label: "Foot", options: STAFF_FOOT_OPTIONS },
  ],
  tridents: [{ key: "type", label: "Type", options: TRIDENT_TYPE_OPTIONS }],
  shields: [
    { key: "shape", label: "Shape", options: SHIELD_SHAPE_OPTIONS },
    { key: "blazon", label: "Blazon", options: SHIELD_BLAZON_OPTIONS },
    { key: "emblem", label: "Emblem", options: SHIELD_EMBLEM_OPTIONS },
    { key: "rim", label: "Rim", options: SHIELD_RIM_OPTIONS },
  ],
};

const AUTO = ""; // sentinel <select> value for "no override, stay random"

/** Read a part value out of the draft's loosely-shaped parts bag. */
function getPart(parts: WeaponParts | undefined, cls: IconClass, key: string): string {
  const bag = parts?.[cls] as Record<string, unknown> | undefined;
  const v = bag?.[key];
  return typeof v === "string" ? v : AUTO;
}

function getTwoHanded(parts: WeaponParts | undefined): "auto" | "one" | "two" {
  const v = parts?.blades?.twoHanded;
  return v === true ? "two" : v === false ? "one" : "auto";
}

interface WeaponIconModalProps {
  open: boolean;
  /** Skill name shown in the title. */
  name: string;
  current: IconConfig;
  onSave: (config: IconConfig) => void;
  onClose: () => void;
}

export function WeaponIconModal({ open, name, current, onSave, onClose }: WeaponIconModalProps) {
  const [draft, setDraft] = useState<IconConfig>(current);

  useEffect(() => {
    if (open) setDraft(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  /** Set (or clear, on AUTO) one field within `parts[cls]`. */
  const setPart = (cls: IconClass, key: string, value: string | boolean | undefined) => {
    setDraft((d) => {
      const parts = { ...(d.parts ?? {}) } as Record<string, Record<string, unknown>>;
      const bag = { ...(parts[cls] ?? {}) };
      if (value === undefined) delete bag[key];
      else bag[key] = value;
      if (Object.keys(bag).length === 0) delete parts[cls];
      else parts[cls] = bag;
      return { ...d, parts: parts as WeaponParts };
    });
  };

  const cls = draft.iconClass as IconClass;
  const fields = PART_FIELDS[cls];

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={`Icon — ${name}`}
      size="sm"
      maxWidth={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            <Icon name="check" size={13} />
            Save
          </Button>
        </>
      }
    >
      <div className="flex gap-[18px]">
        {/* Big preview */}
        <div className="shrink-0 flex flex-col items-center gap-[6px]">
          <div className="flex items-center justify-center rounded-[10px] bg-bg-2 border border-line" style={{ width: 140, height: 140 }}>
            <WeaponIcon config={draft} size={120} particles="themed" />
          </div>
          <span className="text-[9px] font-mono text-txt-3 uppercase tracking-wide">Preview</span>
        </div>

        {/* Controls */}
        <div className="flex-1 min-w-0 flex flex-col gap-[14px]">
          {/* Weapon type */}
          <div>
            <div className="text-[9px] font-mono text-txt-3 uppercase tracking-wide mb-[5px]">Weapon type</div>
            <div className="flex flex-wrap gap-[4px]">
              {WEAPON_TYPES.map((wt) => {
                const selected = draft.iconClass === wt.value;
                return (
                  <button
                    key={wt.value}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, iconClass: wt.value }))}
                    className={[
                      "basis-[calc(50%-2px)] flex items-center gap-[8px] py-[6px] px-[8px] rounded-[8px] border transition-all duration-100 cursor-pointer",
                      selected
                        ? "bg-[rgba(255,120,60,0.10)] border-[rgba(255,120,60,0.45)]"
                        : "bg-bg-2 border-line hover:bg-bg-3 hover:border-line-2",
                    ].join(" ")}
                  >
                    <WeaponIcon config={{ seed: draft.seed, iconClass: wt.value }} size={28} />
                    <span className={["text-[11px] font-semibold", selected ? "text-acc" : "text-txt-2"].join(" ")}>
                      {wt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seed */}
          <div>
            <div className="text-[9px] font-mono text-txt-3 uppercase tracking-wide mb-[5px]">Seed</div>
            <div className="flex items-center gap-[6px]">
              <TextInput
                value={draft.seed}
                onChange={(e) => setDraft((d) => ({ ...d, seed: e.target.value }))}
                className="flex-1 min-w-0 font-mono"
              />
              <Button
                size="sm"
                onClick={() => setDraft((d) => ({ ...d, seed: createRandomSeed() }))}
                className="shrink-0"
              >
                <Icon name="refresh" size={10} />
                Random
              </Button>
            </div>
          </div>

          {/* Build it yourself — headline shape/hilt overrides for the picked
              weapon type. Everything else stays random from the seed, so
              "Random" above still gives useful variety with these locked. */}
          {fields ? (
            <div>
              <div className="text-[9px] font-mono text-txt-3 uppercase tracking-wide mb-[5px]">Customize</div>
              <div className="flex flex-wrap gap-[8px]">
                {fields.map((f) => (
                  <label key={f.key} className="basis-[calc(50%-4px)] flex flex-col gap-[3px]">
                    <span className="text-[10px] text-txt-3">{f.label}</span>
                    <Select
                      value={getPart(draft.parts, cls, f.key)}
                      onChange={(e) => setPart(cls, f.key, e.target.value === AUTO ? undefined : e.target.value)}
                      className="w-full"
                    >
                      <option value={AUTO}>Auto (random)</option>
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                ))}
                {cls === "blades" ? (
                  <label className="basis-[calc(50%-4px)] flex flex-col gap-[3px]">
                    <span className="text-[10px] text-txt-3">Grip</span>
                    <Select
                      value={getTwoHanded(draft.parts)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setPart("blades", "twoHanded", v === "auto" ? undefined : v === "two");
                      }}
                      className="w-full"
                    >
                      <option value="auto">Auto (random)</option>
                      <option value="one">One-Handed</option>
                      <option value="two">Two-Handed</option>
                    </Select>
                  </label>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-[10.5px] text-txt-4 leading-[1.5]">
              Pick a specific weapon type above to customize its parts — the pieces stay locked while "Random" still varies colour and details.
            </p>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
