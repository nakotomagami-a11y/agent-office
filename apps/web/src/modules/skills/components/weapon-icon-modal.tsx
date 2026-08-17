"use client";

import { useEffect, useState } from "react";
import type { IconConfig, IconClassSelector } from "@agent-office/pixel-icons";
import { createRandomSeed } from "@agent-office/pixel-icons";
import { ModalShell } from "@/components/ui/modal-shell";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { WeaponIcon } from "@/components/ui/weapon-icon";

const WEAPON_TYPES: { value: IconClassSelector; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "blades", label: "Blade" },
  { value: "spears", label: "Spear" },
  { value: "axes", label: "Axe" },
  { value: "staffs", label: "Staff" },
  { value: "tridents", label: "Trident" },
];

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

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={`Icon — ${name}`}
      size="sm"
      maxWidth={460}
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
        </div>
      </div>
    </ModalShell>
  );
}
