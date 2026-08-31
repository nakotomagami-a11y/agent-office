"use client";

import { useCallback } from "react";
import type { PlanetConfig } from "@agent-office/domain/types";
import { PLANET_TYPE_DEFS, PLANET_PARAM_DEFS, FREEFORM_TYPES, CANVAS_SCALE, randomPlanetOfType } from "@/lib/planet-seed";
import { PlanetCanvas } from "@/components/ui/planet-canvas";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";

function rgbToHex(rgb: [number, number, number]): string {
  const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${clamp(rgb[0])}${clamp(rgb[1])}${clamp(rgb[2])}`;
}

function randSeed() {
  return Math.floor(Math.random() * 999_999_999) + 1;
}

const CANVAS_SIZE = 220;

export function PlanetGalleryCard({
  config,
  onChange,
}: {
  config: PlanetConfig;
  onChange: (next: PlanetConfig) => void;
}) {
  const type = config.type;
  const typeDef = PLANET_TYPE_DEFS[type];
  const paramDefs = PLANET_PARAM_DEFS[type] ?? [];
  const isFreeform = FREEFORM_TYPES.has(type);
  const dither = config.dither ?? true;
  const rotationDeg = Math.round(((config.rotation ?? 0) * 180) / Math.PI);

  const randomize = useCallback(() => {
    const r = randomPlanetOfType(type);
    onChange({ ...config, seed: r.seed, paletteIdx: r.paletteIdx });
  }, [type, config, onChange]);

  const rerollSeed = useCallback(() => {
    onChange({ ...config, seed: randSeed() });
  }, [config, onChange]);

  return (
    <div
      data-planet-type={type}
      className="flex flex-col gap-[14px] p-[18px] rounded-[18px] border border-edge bg-card"
    >
      <div className="flex items-center gap-[10px]">
        <span className="text-[13.5px] font-bold">{typeDef.label}</span>
        <span className="inline-flex items-center px-[8px] py-[2px] rounded-full bg-acc-soft text-acc text-[10px] font-bold">
          {typeDef.palettes[config.paletteIdx]?.name ?? "Custom"}
        </span>
        <span className="flex-1" />
        <span className="font-mono text-[10.5px] text-txt-4">#{config.seed}</span>
      </div>

      <div
        className="mx-auto flex items-center justify-center"
        style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
      >
        <PlanetCanvas
          projectId={`gallery-${type}`}
          config={config}
          size={Math.round(CANVAS_SIZE / (CANVAS_SCALE[type] ?? 1))}
          className={cn("relative", !isFreeform && "rounded-full overflow-hidden")}
        />
      </div>

      <div className="flex items-center gap-[8px]">
        <button
          type="button"
          onClick={randomize}
          className="flex-1 flex items-center justify-center gap-[6px] py-[8px] px-[10px] rounded-[10px] border-none bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white text-[11.5px] font-bold cursor-pointer whitespace-nowrap"
        >
          <Icon name="refresh" size={12} /> Randomize
        </button>
        <button
          type="button"
          onClick={rerollSeed}
          title="Reroll seed only"
          className="shrink-0 w-[32px] h-[32px] flex items-center justify-center rounded-[10px] border border-edge-2 bg-card-2 text-txt-3 cursor-pointer transition-colors duration-150 hover:text-txt hover:border-txt-4"
        >
          <Icon name="sparkle" size={12} />
        </button>
      </div>

      <GradientSlider
        label="Rotate"
        display={`${rotationDeg}°`}
        min={0}
        max={360}
        value={rotationDeg}
        onChange={(deg) => onChange({ ...config, rotation: (deg * Math.PI) / 180 })}
      />

      {paramDefs.map((def) => {
        const value = config.params?.[def.key] ?? def.default;
        const pct = Math.round((value / (def.displayMax ?? def.max)) * 100);
        return (
          <GradientSlider
            key={def.key}
            label={def.label}
            display={`${pct}%`}
            min={def.min}
            max={def.max}
            step={def.step}
            value={value}
            onChange={(v) => onChange({ ...config, params: { ...config.params, [def.key]: v } })}
          />
        );
      })}

      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-semibold text-txt-2">Dither</span>
        <Switch checked={dither} onChange={(next) => onChange({ ...config, dither: next })} label="Dither" />
      </div>

      <div className="flex flex-wrap gap-[6px] pt-[4px] border-t border-edge">
        {typeDef.palettes.map((palette, idx) => {
          const selected = config.paletteIdx === idx;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onChange({ ...config, paletteIdx: idx, customPalette: undefined })}
              className={cn(
                "flex items-center gap-[6px] py-[5px] pl-[5px] pr-[10px] rounded-full cursor-pointer mt-[8px] transition-colors duration-150",
                selected ? "bg-acc-soft border border-acc-line" : "bg-card-2 border border-edge hover:border-edge-2",
              )}
            >
              <div className="flex">
                {palette.layers.flat().slice(0, 5).map((rgb, i) => (
                  <span
                    key={i}
                    className="w-[12px] h-[12px] rounded-full border-2 border-card-2"
                    style={{ background: rgbToHex(rgb), marginLeft: i > 0 ? -5 : 0 }}
                  />
                ))}
              </div>
              <span className={cn("text-[10.5px] font-semibold whitespace-nowrap", selected ? "text-acc" : "text-txt-2")}>
                {palette.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Trimmed copy of the slider from planet-editor-modal.tsx — duplicated rather
// than shared so this dev-only tool has zero blast radius on the production
// modal component.
function GradientSlider({
  label,
  display,
  min,
  max,
  step = 1,
  value,
  onChange,
}: {
  label: string;
  display: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-center mb-[7px]">
        <span className="text-[11.5px] font-semibold text-txt-2">{label}</span>
        <span className="flex-1" />
        <span className="font-mono text-[10.5px] text-txt-4">{display}</span>
      </div>
      <div className="relative h-[5px] rounded-full bg-card-3 shadow-[var(--inset-hi)]">
        <div className="absolute left-0 top-0 bottom-0 rounded-full bg-[linear-gradient(90deg,var(--acc-cta),var(--acc-2))]" style={{ width: `${pct}%` }} />
        <div
          className="absolute top-1/2 w-[13px] h-[13px] rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,.35)] pointer-events-none"
          style={{ left: `${pct}%`, transform: "translate(-50%, -50%)" }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute -inset-y-[7px] inset-x-0 w-full h-[19px] m-0 opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}
