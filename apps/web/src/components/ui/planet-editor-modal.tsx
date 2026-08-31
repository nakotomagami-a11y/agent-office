"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { PlanetConfig, PlanetType } from "@agent-office/domain/types";
import { PLANET_TYPE_DEFS, PLANET_PARAM_DEFS, FREEFORM_TYPES, CANVAS_SCALE, randomPlanetOfType } from "@/lib/planet-seed";
import { ModalShell } from "./modal-shell";
import { PlanetCanvas } from "./planet-canvas";
import { Icon } from "./icon";
import { Switch } from "./switch";
import { cn } from "@/lib/cn";

function rgbToHex(rgb: [number, number, number]): string {
  const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${clamp(rgb[0])}${clamp(rgb[1])}${clamp(rgb[2])}`;
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

interface PlanetEditorModalProps {
  open: boolean;
  projectId: string;
  current?: PlanetConfig;
  onSave: (config: PlanetConfig) => void;
  onClose: () => void;
}

// PLANET_TYPE_DEFS is a Record<PlanetType, …> — its keys are the full type set.
const PLANET_TYPES = Object.keys(PLANET_TYPE_DEFS) as PlanetType[];

const DEFAULT_PIXELS = 1000;

function randSeed() {
  return Math.floor(Math.random() * 999999999);
}

export function PlanetEditorModal({
  open,
  projectId,
  current,
  onSave,
  onClose,
}: PlanetEditorModalProps) {
  const t = useTranslations("planet_editor_modal");
  const withDefaults = (c: PlanetConfig): PlanetConfig => ({
    ...c,
    pixels: c.pixels ?? DEFAULT_PIXELS,
    dither: c.dither ?? true,
  });

  const [draft, setDraft] = useState<PlanetConfig>(
    current ? withDefaults(current) : { type: "gas-giant", seed: randSeed(), paletteIdx: 0, pixels: DEFAULT_PIXELS, dither: true },
  );
  const [customColorsOpen, setCustomColorsOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(current ? withDefaults(current) : { type: "gas-giant", seed: randSeed(), paletteIdx: 0, pixels: DEFAULT_PIXELS, dither: true });
      setCustomColorsOpen(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setType = useCallback((type: PlanetType) => {
    const palettes = PLANET_TYPE_DEFS[type].palettes;
    setDraft((d) => ({
      ...d,
      type,
      paletteIdx: Math.min(d.paletteIdx, palettes.length - 1),
      customPalette: undefined,
      params: undefined,
    }));
  }, []);

  const setPalette = useCallback((idx: number) => {
    setDraft((d) => ({ ...d, paletteIdx: idx, customPalette: undefined }));
  }, []);

  const setParam = useCallback((key: string, value: number) => {
    setDraft((d) => ({ ...d, params: { ...d.params, [key]: value } }));
  }, []);

  const randomize = useCallback(() => {
    const r = randomPlanetOfType(draft.type);
    setDraft((d) => ({ ...d, seed: r.seed, paletteIdx: r.paletteIdx, customPalette: undefined }));
  }, [draft.type]);

  const rerollSeed = useCallback(() => {
    setDraft((d) => ({ ...d, seed: randSeed() }));
  }, []);

  const handleCustomColor = useCallback((layerIdx: number, colorIdx: number, hex: string) => {
    const rgb = hexToRgb(hex);
    setDraft((d) => {
      const baseLayers = PLANET_TYPE_DEFS[d.type].palettes[d.paletteIdx]?.layers ?? [];
      const cur = d.customPalette ?? baseLayers.map((l) => l.map((c) => [...c] as [number, number, number]));
      const next = cur.map((layer, li) =>
        li === layerIdx ? layer.map((c, ci) => (ci === colorIdx ? rgb : c) as [number, number, number]) : layer,
      );
      return { ...d, customPalette: next };
    });
  }, []);

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  const typeDef = PLANET_TYPE_DEFS[draft.type];
  const paramDefs = PLANET_PARAM_DEFS[draft.type] ?? [];
  const rotationDeg = Math.round(((draft.rotation ?? 0) * 180) / Math.PI);
  const dither = draft.dither ?? true;
  const isFreeform = FREEFORM_TYPES.has(draft.type);
  const activeLayers: [number, number, number][][] =
    (draft.customPalette as [number, number, number][][] | undefined) ?? typeDef.palettes[draft.paletteIdx]?.layers ?? [];

  return (
    <ModalShell open={open} onClose={onClose} bareContent maxWidth={800} className="rounded-[26px] max-h-[88vh]">
      <div className="flex items-center gap-[12px] px-[24px] py-[20px] border-b border-edge shrink-0">
        <span className="text-[17px] font-bold whitespace-nowrap">{t("title")}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close_aria")}
          className="w-[32px] h-[32px] flex items-center justify-center rounded-md border-none bg-transparent text-txt-3 cursor-pointer transition-colors duration-150 hover:bg-card-2 hover:text-txt"
        >
          <Icon name="x" size={15} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex gap-[20px] p-[20px]">
        {/* Left: live preview well */}
        <div className="w-[252px] shrink-0 flex flex-col items-center gap-[14px] px-[16px] py-[22px]">
          <div className="relative w-[172px] h-[172px] flex items-center justify-center">
            <PlanetCanvas
              projectId={`${projectId}-editor`}
              config={draft}
              size={Math.round(160 / (CANVAS_SCALE[draft.type] ?? 1))}
              className={cn("relative", !isFreeform && "rounded-full overflow-hidden")}
            />
          </div>
          <div className="text-center leading-[1.35]">
            <div className="text-[15px] font-bold">{typeDef.label}</div>
            <div className="inline-flex items-center gap-[5px] mt-[5px] px-[9px] py-[3px] rounded-full bg-acc-soft text-acc text-[10.5px] font-bold">
              {typeDef.palettes[draft.paletteIdx]?.name ?? t("custom_palette")}
            </div>
          </div>
          <div className="flex items-center gap-[8px] w-full">
            <button
              type="button"
              onClick={randomize}
              title={t("randomize_title")}
              className="flex-1 flex items-center justify-center gap-[7px] py-[10px] px-[12px] rounded-[12px] border-none bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white text-[12.5px] font-bold cursor-pointer whitespace-nowrap shadow-[0_12px_24px_-12px_rgba(139,123,255,0.75)] transition-transform duration-150 hover:-translate-y-[1px]"
            >
              <Icon name="refresh" size={13} /> {t("randomize")}
            </button>
            <button
              type="button"
              onClick={rerollSeed}
              title={t("reroll_title")}
              className="shrink-0 w-[38px] h-[38px] flex items-center justify-center rounded-[12px] border border-edge-2 bg-card text-txt-3 cursor-pointer transition-colors duration-150 hover:text-txt hover:border-txt-4"
            >
              <Icon name="sparkle" size={14} />
            </button>
          </div>
          <div className="w-full pt-[12px] border-t border-edge">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.06em] uppercase text-txt-4">{t("seed_label")}</span>
              <span className="font-mono text-[11px] text-txt-3">{draft.seed}</span>
            </div>
          </div>
        </div>

        {/* Right: type / sliders / dither / palette */}
        <div className="flex-1 min-w-0 flex flex-col gap-[20px]">
          <div>
            <div className="text-[10.5px] font-bold tracking-[0.07em] uppercase text-txt-4 mb-[9px]">{t("type_label")}</div>
            <div className="flex flex-wrap gap-[7px]">
              {PLANET_TYPES.map((t) => {
                const def = PLANET_TYPE_DEFS[t];
                const swatch = rgbToHex(def.palettes[0]?.layers[0]?.[0] ?? [0.5, 0.5, 0.5]);
                const selected = draft.type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      "flex items-center gap-[8px] py-[8px] pl-[10px] pr-[14px] rounded-full cursor-pointer transition-[filter] duration-150 hover:brightness-[1.06]",
                      selected ? "bg-acc-soft text-acc shadow-[0_0_0_1px_var(--acc-line)]" : "bg-card-2 text-txt-2",
                    )}
                  >
                    <span className="w-[16px] h-[16px] rounded-full shrink-0 shadow-[inset_0_0_0_1px_rgba(0,0,0,.2)]" style={{ background: swatch }} />
                    <span className="text-[12px] font-semibold whitespace-nowrap">{def.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-[16px]">
            <GradientSlider label={t("rotate_label")} display={`${rotationDeg}°`} min={0} max={360} value={rotationDeg} onChange={(deg) => setDraft((d) => ({ ...d, rotation: (deg * Math.PI) / 180 }))} />
            {paramDefs.map((def) => {
              const value = draft.params?.[def.key] ?? def.default;
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
                  onChange={(v) => setParam(def.key, v)}
                />
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-semibold text-txt-2">{t("dither_label")}</span>
            <Switch
              checked={dither}
              onChange={(next) => setDraft((d) => ({ ...d, dither: next }))}
              label={t("dither_label")}
            />
          </div>

          <div>
            <div className="flex items-center mb-[10px]">
              <span className="text-[10.5px] font-bold tracking-[0.07em] uppercase text-txt-4">{t("palette_label")}</span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setCustomColorsOpen((v) => !v)}
                className="flex items-center gap-[5px] text-[11.5px] font-semibold text-acc cursor-pointer bg-transparent border-none whitespace-nowrap"
              >
                <Icon name="edit" size={11} /> {customColorsOpen ? t("hide_colors") : t("customize_colors")}
              </button>
            </div>
            <div className="flex flex-wrap gap-[9px]">
              {typeDef.palettes.map((palette, idx) => {
                const selected = draft.paletteIdx === idx;
                const swatches = (selected ? activeLayers : palette.layers).flat();
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPalette(idx)}
                    className={cn(
                      "flex items-center gap-[10px] py-[8px] pl-[8px] pr-[14px] rounded-full cursor-pointer transition-colors duration-150",
                      selected ? "bg-acc-soft border border-acc-line" : "bg-card-2 border border-edge hover:border-edge-2",
                    )}
                  >
                    <div className="flex">
                      {swatches.map((rgb, i) => (
                        <span
                          key={i}
                          className="w-[16px] h-[16px] rounded-full border-2 border-card-2 first:ml-0"
                          style={{ background: rgbToHex(rgb), marginLeft: i > 0 ? -6 : 0 }}
                        />
                      ))}
                    </div>
                    <span className={cn("text-[12px] font-semibold whitespace-nowrap", selected ? "text-acc" : "text-txt-2")}>{palette.name}</span>
                  </button>
                );
              })}
            </div>
            {customColorsOpen && (
              <div className="flex flex-wrap gap-[14px] mt-[14px] pt-[14px] border-t border-edge">
                {activeLayers.map((layer, li) =>
                  layer.map((rgb, ci) => {
                    const hex = rgbToHex(rgb);
                    return (
                      <label key={`${li}-${ci}`} className="flex flex-col items-center gap-[6px] cursor-pointer">
                        <span
                          className="relative w-[28px] h-[28px] rounded-full overflow-hidden shadow-[0_0_0_3px_var(--card-2),0_0_0_4px_var(--edge-2)]"
                          style={{ background: hex }}
                        >
                          <input
                            type="color"
                            value={hex}
                            onChange={(e) => handleCustomColor(li, ci, e.target.value)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer border-none p-0"
                            aria-label={t("layer_color_aria", { layer: li + 1, color: ci + 1 })}
                          />
                        </span>
                        <span className="text-[9px] text-txt-4 whitespace-nowrap">{t("color_label", { layer: li + 1, color: ci + 1 })}</span>
                      </label>
                    );
                  }),
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-[10px] px-[24px] py-[18px] border-t border-edge shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="py-[10px] px-[18px] rounded-[11px] border border-edge-2 bg-card-2 text-txt-2 text-[13px] font-semibold cursor-pointer whitespace-nowrap transition-colors duration-150 hover:text-txt hover:border-txt-4"
        >
          {t("cancel")}
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-[7px] py-[10px] px-[20px] rounded-[11px] border-none bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white text-[13px] font-bold cursor-pointer whitespace-nowrap shadow-[0_12px_26px_-12px_rgba(139,123,255,0.8)] transition-transform duration-150 hover:-translate-y-[1px]"
        >
          <Icon name="check" size={13} /> {t("save")}
        </button>
      </div>
    </ModalShell>
  );
}

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
      <div className="flex items-center mb-[9px]">
        <span className="text-[12.5px] font-semibold text-txt-2">{label}</span>
        <span className="flex-1" />
        <span className="font-mono text-[11px] text-txt-4">{display}</span>
      </div>
      <div className="relative h-[6px] rounded-full bg-card-3 shadow-[var(--inset-hi)]">
        <div className="absolute left-0 top-0 bottom-0 rounded-full bg-[linear-gradient(90deg,var(--acc-cta),var(--acc-2))]" style={{ width: `${pct}%` }} />
        <div
          className="absolute top-1/2 w-[15px] h-[15px] rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,.35)] pointer-events-none"
          style={{ left: `${pct}%`, transform: "translate(-50%, -50%)" }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute -inset-y-[8px] inset-x-0 w-full h-[22px] m-0 opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}
