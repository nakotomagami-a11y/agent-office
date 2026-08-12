"use client";

import { useEffect, useState } from "react";
import type { IconConfig, IconClassSelector } from "@agent-office/pixel-icons";
import { createRandomSeed } from "@agent-office/pixel-icons";
import { ModalShell } from "@/components/ui/modal-shell";
import { Icon } from "@/components/ui/icon";
import { ACCENT_BTN } from "@/lib/button-styles";
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
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center px-4 py-[7px] rounded-[8px] text-[13px] font-medium text-txt-2 bg-transparent border border-line hover:bg-bg-3 hover:text-txt transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`inline-flex items-center gap-[6px] px-4 py-[7px] rounded-[8px] text-[13px] font-semibold ${ACCENT_BTN} transition-colors cursor-pointer`}
          >
            <Icon name="check" size={13} />
            Save
          </button>
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
              <input
                type="text"
                value={draft.seed}
                onChange={(e) => setDraft((d) => ({ ...d, seed: e.target.value }))}
                className="flex-1 min-w-0 bg-bg-3 border border-line text-txt text-[11px] font-mono rounded-[6px] px-[8px] py-[4px] outline-none focus:border-line-2"
              />
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, seed: createRandomSeed() }))}
                className="shrink-0 inline-flex items-center gap-[4px] px-[8px] py-[4px] rounded-[6px] text-[11px] font-semibold text-txt-2 bg-bg-3 border border-line hover:bg-[rgba(255,255,255,0.06)] hover:text-txt transition-colors cursor-pointer"
              >
                <Icon name="refresh" size={10} />
                Random
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
